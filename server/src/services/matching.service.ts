/**
 * MatchingService — geographic and topic-based instructor matching.
 *
 * Stage 1: topic filter (classSlug in instructor.topics)
 * Stage 2: geography filter (serviceZips membership or Haversine distance)
 * Stage 3: availability filter (Pike13Client.getAvailableSlots) — wired in ticket 006
 */

import type { IPike13Client, Pike13AppointmentSlot } from './pike13.client';
import type { PrismaClient } from '../generated/prisma/client';

export interface ZipCentroid {
  zip: string;
  lat: number;
  lng: number;
}

export interface MatchCandidate {
  instructorId: number;
  pike13UserId: string;
  email: string;
  distanceKm: number;
  slots: Pike13AppointmentSlot[];
}

// Haversine formula: returns distance in km between two lat/lng points
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Convert distance km to estimated drive minutes: 1 min ≈ 1.5 km
function kmToDriveMinutes(km: number): number {
  return km / 1.5;
}

export class MatchingService {
  private zipCentroids: Map<string, ZipCentroid> | null = null;

  constructor(
    private prisma: any,
    private pike13Client: IPike13Client,
    private zipCentroidData?: ZipCentroid[],
  ) {}

  private async getZipCentroids(): Promise<Map<string, ZipCentroid>> {
    if (!this.zipCentroids) {
      let data: ZipCentroid[];
      if (this.zipCentroidData) {
        data = this.zipCentroidData;
      } else {
        // Lazy-load from bundled data file
        const { default: centroids } = await import('../static/zip-centroids.json', {
          assert: { type: 'json' },
        }).catch(async () => {
          // Try without assert for older Node
          return import('../static/zip-centroids.json');
        });
        data = centroids as ZipCentroid[];
      }
      this.zipCentroids = new Map(data.map((z) => [z.zip, z]));
    }
    return this.zipCentroids;
  }

  /**
   * Stage 1+2: find candidates by topic and geography (no availability check).
   */
  async findCandidatesByTopicAndGeo(params: {
    zip: string;
    classSlug: string;
  }): Promise<{ candidates: MatchCandidate[]; error?: string }> {
    const centroids = await this.getZipCentroids();

    const requesterCentroid = centroids.get(params.zip);
    if (!requesterCentroid) {
      return { candidates: [], error: 'uncovered_zip' };
    }

    // Fetch all active instructors
    const instructors = await this.prisma.instructorProfile.findMany({
      where: { active: true },
    });

    const candidates: MatchCandidate[] = [];

    for (const instructor of instructors) {
      // Normalize topics (may be JSON string in SQLite or array in PG)
      const topics: string[] = Array.isArray(instructor.topics)
        ? instructor.topics
        : [];

      // Stage 1: topic filter
      if (!topics.includes(params.classSlug)) continue;

      const serviceZips: string[] = Array.isArray(instructor.serviceZips)
        ? instructor.serviceZips
        : [];

      let distanceKm = 0;

      if (serviceZips.length > 0) {
        // Stage 2a: explicit serviceZips membership check
        if (!serviceZips.includes(params.zip)) continue;
      } else {
        // Stage 2b: Haversine distance check
        const instructorCentroid = centroids.get(instructor.homeZip);
        if (!instructorCentroid) {
          // Skip instructors with unresolvable home zip
          continue;
        }
        distanceKm = haversineKm(
          requesterCentroid.lat,
          requesterCentroid.lng,
          instructorCentroid.lat,
          instructorCentroid.lng,
        );
        const driveMinutes = kmToDriveMinutes(distanceKm);
        if (driveMinutes > instructor.maxTravelMinutes) continue;
      }

      candidates.push({
        instructorId: instructor.id,
        pike13UserId: instructor.pike13UserId,
        email: instructor.email,
        distanceKm,
        slots: [],
      });
    }

    // Sort by distance (nearest first)
    candidates.sort((a, b) => a.distanceKm - b.distanceKm);

    return { candidates };
  }

  /**
   * Stage 1+2+3: find candidates with availability within look-ahead window.
   */
  async findMatchingInstructors(params: {
    zip: string;
    classSlug: string;
    lookAheadDays?: number;
    excludeInstructorIds?: number[];
  }): Promise<{ candidates: MatchCandidate[]; error?: string }> {
    const { candidates, error } = await this.findCandidatesByTopicAndGeo(params);
    if (error) return { candidates, error };

    const lookAheadDays =
      params.lookAheadDays !== undefined
        ? params.lookAheadDays
        : Number(process.env.AVAILABILITY_LOOKAHEAD_DAYS) || 90;

    const now = new Date();
    const end = new Date(now.getTime() + lookAheadDays * 24 * 60 * 60 * 1000);
    const dateRange = { start: now, end };

    const filtered: MatchCandidate[] = [];

    for (const candidate of candidates) {
      // Exclude instructors that already have an assignment for this request
      if (
        params.excludeInstructorIds &&
        params.excludeInstructorIds.includes(candidate.instructorId)
      ) {
        continue;
      }

      try {
        const slots = await this.pike13Client.getAvailableSlots(
          candidate.pike13UserId,
          dateRange,
        );
        if (slots.length > 0) {
          filtered.push({ ...candidate, slots });
        }
      } catch {
        // Degrade gracefully: skip instructors whose Pike13 call fails
        continue;
      }
    }

    return { candidates: filtered };
  }

  /**
   * Aggregate slots from all matching candidates, deduplicating by start time.
   */
  aggregateSlots(candidates: MatchCandidate[]): string[] {
    const seen = new Set<string>();
    const slots: string[] = [];
    for (const c of candidates) {
      for (const slot of c.slots) {
        const key = slot.start.toISOString();
        if (!seen.has(key)) {
          seen.add(key);
          slots.push(key);
        }
      }
    }
    slots.sort();
    return slots;
  }
}
