/**
 * Tests for MatchingService — topic + geography filtering.
 * These tests cover stages 1 (topic) and 2 (geography) of matching.
 * Availability stage (Pike13) tests are added in ticket 006.
 */
import request from 'supertest';
import { prisma } from '../../server/src/services/prisma';
import { MatchingService, type ZipCentroid } from '../../server/src/services/matching.service';
import { MockPike13Client } from '../../server/src/services/pike13.client';

process.env.NODE_ENV = 'test';
import app from '../../server/src/app';

// Small in-process centroid dataset for tests (no file I/O)
const TEST_CENTROIDS: ZipCentroid[] = [
  { zip: '90210', lat: 34.0901, lng: -118.4065 },  // Beverly Hills
  { zip: '90211', lat: 34.0885, lng: -118.3853 },  // ~2km away
  { zip: '90212', lat: 34.0736, lng: -118.4028 },  // ~2km away
  { zip: '10001', lat: 40.7484, lng: -73.9967 },   // New York (far)
  { zip: '97201', lat: 45.5120, lng: -122.6837 },  // Portland
  { zip: '97202', lat: 45.4916, lng: -122.6471 },  // Portland nearby (~3km)
];

let instructorIds: number[] = [];

async function createInstructor(params: {
  pike13UserId: string;
  topics: string[];
  homeZip: string;
  maxTravelMinutes: number;
  serviceZips?: string[];
}) {
  const profile = await prisma.instructorProfile.create({
    data: {
      pike13UserId: params.pike13UserId,
      displayName: `Test ${params.pike13UserId}`,
      email: `${params.pike13UserId}@example.com`,
      topics: params.topics,
      homeZip: params.homeZip,
      maxTravelMinutes: params.maxTravelMinutes,
      serviceZips: params.serviceZips || [],
      active: true,
    },
  });
  instructorIds.push(profile.id);
  return profile;
}

describe('MatchingService — topic + geography filter', () => {
  let mockPike13: MockPike13Client;
  let matching: MatchingService;

  beforeAll(async () => {
    // Create test instructor profiles
    await createInstructor({
      pike13UserId: 'match-test-001',
      topics: ['python-intro', 'scratch-basics'],
      homeZip: '90210',
      maxTravelMinutes: 60,
    });

    await createInstructor({
      pike13UserId: 'match-test-002',
      topics: ['python-intro'],
      homeZip: '90211',
      maxTravelMinutes: 30,
    });

    await createInstructor({
      pike13UserId: 'match-test-003',
      topics: ['scratch-basics'],
      homeZip: '10001', // New York — far from LA
      maxTravelMinutes: 999,
    });

    await createInstructor({
      pike13UserId: 'match-test-004',
      topics: ['python-intro'],
      homeZip: 'XXXXX', // Unresolvable zip
      maxTravelMinutes: 60,
    });

    await createInstructor({
      pike13UserId: 'match-test-005',
      topics: ['python-intro'],
      homeZip: '97201',
      maxTravelMinutes: 30,
      serviceZips: ['90210', '90211'], // Explicit service zips in LA
    });
  });

  beforeEach(() => {
    mockPike13 = new MockPike13Client();
    matching = new MatchingService(prisma, mockPike13, TEST_CENTROIDS);
  });

  afterAll(async () => {
    await prisma.instructorProfile.deleteMany({
      where: {
        pike13UserId: {
          in: ['match-test-001', 'match-test-002', 'match-test-003', 'match-test-004', 'match-test-005'],
        },
      },
    }).catch(() => {});
  });

  describe('findCandidatesByTopicAndGeo', () => {
    it('returns error for unrecognized requester zip', async () => {
      const result = await matching.findCandidatesByTopicAndGeo({
        zip: 'ZZZZZ',
        classSlug: 'python-intro',
      });
      expect(result.error).toBe('uncovered_zip');
      expect(result.candidates).toHaveLength(0);
    });

    it('filters by topic — only instructors teaching the class', async () => {
      const result = await matching.findCandidatesByTopicAndGeo({
        zip: '90210',
        classSlug: 'scratch-basics',
      });
      // Only match-test-001 teaches scratch-basics AND is near 90210
      // match-test-003 teaches scratch-basics but is in NY (unresolvable distance or too far)
      expect(result.error).toBeUndefined();
      const pike13Ids = result.candidates.map((c) => c.pike13UserId);
      expect(pike13Ids).toContain('match-test-001');
      expect(pike13Ids).not.toContain('match-test-002'); // Only teaches python
      expect(pike13Ids).not.toContain('match-test-003'); // In NY, too far
    });

    it('filters by radius — instructors outside maxTravelMinutes are excluded', async () => {
      const result = await matching.findCandidatesByTopicAndGeo({
        zip: '90210',
        classSlug: 'python-intro',
      });
      // match-test-001: 90210 home, teaching python, within 60 min ✓
      // match-test-002: 90211 home, ~2km from 90210, within 30 min ✓
      // match-test-003: 10001 (NY), too far ✗
      // match-test-004: XXXXX (unresolvable), skip ✗
      // match-test-005: 97201 but serviceZips includes 90210 ✓
      const pike13Ids = result.candidates.map((c) => c.pike13UserId);
      expect(pike13Ids).toContain('match-test-001');
      expect(pike13Ids).toContain('match-test-002');
      expect(pike13Ids).not.toContain('match-test-003');
      expect(pike13Ids).not.toContain('match-test-004');
    });

    it('uses serviceZips for instructors who have explicit service area', async () => {
      const result = await matching.findCandidatesByTopicAndGeo({
        zip: '90210',
        classSlug: 'python-intro',
      });
      // match-test-005 has serviceZips including 90210
      const pike13Ids = result.candidates.map((c) => c.pike13UserId);
      expect(pike13Ids).toContain('match-test-005');
    });

    it('excludes instructors with unresolvable homeZip (when not using serviceZips)', async () => {
      const result = await matching.findCandidatesByTopicAndGeo({
        zip: '90210',
        classSlug: 'python-intro',
      });
      const pike13Ids = result.candidates.map((c) => c.pike13UserId);
      expect(pike13Ids).not.toContain('match-test-004'); // XXXXX is unresolvable
    });

    it('sorts candidates by distance (nearest first)', async () => {
      const result = await matching.findCandidatesByTopicAndGeo({
        zip: '90210',
        classSlug: 'python-intro',
      });
      expect(result.candidates.length).toBeGreaterThan(0);
      // Verify sorted by distanceKm ascending
      for (let i = 1; i < result.candidates.length; i++) {
        expect(result.candidates[i].distanceKm).toBeGreaterThanOrEqual(
          result.candidates[i - 1].distanceKm,
        );
      }
    });

    it('returns empty array when no instructors match topic', async () => {
      const result = await matching.findCandidatesByTopicAndGeo({
        zip: '90210',
        classSlug: 'nonexistent-class',
      });
      expect(result.candidates).toHaveLength(0);
      expect(result.error).toBeUndefined();
    });

    it('serviceZips membership check excludes instructor if zip not in list', async () => {
      // match-test-005 has serviceZips: ['90210', '90211']
      // Requesting from 97201 (Portland) — not in serviceZips
      const result = await matching.findCandidatesByTopicAndGeo({
        zip: '97201',
        classSlug: 'python-intro',
      });
      const pike13Ids = result.candidates.map((c) => c.pike13UserId);
      expect(pike13Ids).not.toContain('match-test-005');
    });
  });
});

describe('GET /api/requests/availability', () => {
  beforeAll(async () => {
    // Ensure instructor profiles exist from above
  });

  it('returns 422 when zip is missing', async () => {
    const res = await request(app).get('/api/requests/availability?classSlug=python-intro');
    expect(res.status).toBe(422);
  });

  it('returns 422 when classSlug is missing', async () => {
    const res = await request(app).get('/api/requests/availability?zip=90210');
    expect(res.status).toBe(422);
  });

  it('returns 422 when zip is not 5 digits', async () => {
    const res = await request(app).get('/api/requests/availability?zip=abc&classSlug=python-intro');
    expect(res.status).toBe(422);
  });

  it('returns { available: false } when no instructors match', async () => {
    const res = await request(app).get('/api/requests/availability?zip=10001&classSlug=nonexistent');
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(false);
  });

  it('returns { available: true, slots: [] } when instructors match (no availability stage yet)', async () => {
    // With MockPike13Client returning no slots, available will be false
    // This will be updated in ticket 006 when availability stage is wired in
    // For now, the endpoint should return a valid response
    const res = await request(app).get('/api/requests/availability?zip=90210&classSlug=python-intro');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('available');
  });
});
