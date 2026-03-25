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

describe('MatchingService — availability stage (ticket 006)', () => {
  let mockPike13: MockPike13Client;
  let matching: MatchingService;

  const SLOT_A: import('../../server/src/services/pike13.client').Pike13AppointmentSlot = {
    start: new Date('2026-04-01T10:00:00Z'),
    end: new Date('2026-04-01T11:00:00Z'),
  };
  const SLOT_B: import('../../server/src/services/pike13.client').Pike13AppointmentSlot = {
    start: new Date('2026-04-02T10:00:00Z'),
    end: new Date('2026-04-02T11:00:00Z'),
  };

  // These tests need instructor profiles — create them independently from
  // the topic+geo describe block (which cleans up in its own afterAll).
  beforeAll(async () => {
    await createInstructor({
      pike13UserId: 'avail-test-001',
      topics: ['python-intro'],
      homeZip: '90210',
      maxTravelMinutes: 60,
    });
    await createInstructor({
      pike13UserId: 'avail-test-002',
      topics: ['python-intro'],
      homeZip: '90211',
      maxTravelMinutes: 30,
    });
  });

  afterAll(async () => {
    await prisma.instructorProfile.deleteMany({
      where: {
        pike13UserId: { in: ['avail-test-001', 'avail-test-002'] },
      },
    }).catch(() => {});
  });

  beforeEach(() => {
    mockPike13 = new MockPike13Client();
    matching = new MatchingService(prisma, mockPike13, TEST_CENTROIDS);
  });

  it('includes instructor when they have available slots', async () => {
    mockPike13.setSlots('avail-test-001', [SLOT_A]);

    const result = await matching.findMatchingInstructors({
      zip: '90210',
      classSlug: 'python-intro',
    });

    const ids = result.candidates.map((c) => c.pike13UserId);
    expect(ids).toContain('avail-test-001');
  });

  it('excludes instructor when they have no available slots', async () => {
    mockPike13.setSlots('avail-test-001', [SLOT_A]);
    // avail-test-002 gets no setSlots call — returns [] by default

    const result = await matching.findMatchingInstructors({
      zip: '90210',
      classSlug: 'python-intro',
    });

    const ids = result.candidates.map((c) => c.pike13UserId);
    expect(ids).toContain('avail-test-001');
    expect(ids).not.toContain('avail-test-002'); // no slots → excluded
  });

  it('degrades gracefully when one instructor Pike13 call throws — others still returned', async () => {
    mockPike13.setShouldThrow('avail-test-001');     // Will throw
    mockPike13.setSlots('avail-test-002', [SLOT_A]); // Returns normally

    const result = await matching.findMatchingInstructors({
      zip: '90210',
      classSlug: 'python-intro',
    });

    const ids = result.candidates.map((c) => c.pike13UserId);
    expect(ids).not.toContain('avail-test-001'); // Threw, skipped
    expect(ids).toContain('avail-test-002');     // Returned normally
  });

  it('excludes instructors listed in excludeInstructorIds', async () => {
    mockPike13.setSlots('avail-test-001', [SLOT_A]);
    mockPike13.setSlots('avail-test-002', [SLOT_A]);

    // Get the instructorId for avail-test-001 to exclude it
    const prof001 = await prisma.instructorProfile.findFirst({
      where: { pike13UserId: 'avail-test-001' },
    });

    const result = await matching.findMatchingInstructors({
      zip: '90210',
      classSlug: 'python-intro',
      excludeInstructorIds: [prof001!.id],
    });

    const ids = result.candidates.map((c) => c.pike13UserId);
    expect(ids).not.toContain('avail-test-001');
    expect(ids).toContain('avail-test-002');
  });

  it('aggregateSlots deduplicates slots with the same start time', () => {
    const candidates = [
      {
        instructorId: 1,
        pike13UserId: 'a',
        email: 'a@a.com',
        distanceKm: 0,
        slots: [SLOT_A, SLOT_B],
      },
      {
        instructorId: 2,
        pike13UserId: 'b',
        email: 'b@b.com',
        distanceKm: 1,
        slots: [SLOT_A], // Duplicate of SLOT_A
      },
    ];

    const slots = matching.aggregateSlots(candidates);
    expect(slots).toHaveLength(2); // Only 2 unique slots
    expect(slots[0]).toBe(SLOT_A.start.toISOString());
    expect(slots[1]).toBe(SLOT_B.start.toISOString());
  });

  it('aggregateSlots returns slots sorted ascending', () => {
    const candidates = [
      {
        instructorId: 1,
        pike13UserId: 'a',
        email: 'a@a.com',
        distanceKm: 0,
        slots: [SLOT_B, SLOT_A], // Out of order
      },
    ];

    const slots = matching.aggregateSlots(candidates);
    expect(slots[0]).toBe(SLOT_A.start.toISOString()); // Earlier date first
    expect(slots[1]).toBe(SLOT_B.start.toISOString());
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

  it('returns { available: false } when instructors match geo/topic but have no Pike13 slots', async () => {
    // MockPike13Client defaults to returning [] for all instructors
    const res = await request(app).get('/api/requests/availability?zip=90210&classSlug=python-intro');
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(false);
  });

  it('returns response with available property for valid zip+classSlug', async () => {
    // Endpoint shape check — availability filtering is tested in unit tests above
    const res = await request(app).get('/api/requests/availability?zip=90210&classSlug=python-intro');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('available');
    // When MockPike13Client returns no slots (default), available is false
    if (res.body.available) {
      expect(Array.isArray(res.body.slots)).toBe(true);
    }
  });
});
