/**
 * Tests for instructor consent flow:
 * - POST /api/instructor/assignments/:id/accept
 * - POST /api/instructor/assignments/:id/decline
 * - InstructorService.sendReminders (timeout + reminder logic)
 * - advanceToNextInstructor (no-more-candidates → admin notified)
 *
 * Ticket 009 — Instructor matching & consent flow.
 */
import request from 'supertest';
import { prisma } from '../../server/src/services/prisma';
import { InstructorService } from '../../server/src/services/instructor.service';
import { InMemoryEmailTransport, EmailService } from '../../server/src/services/email.service';
import { MatchingService } from '../../server/src/services/matching.service';
import { MockPike13Client } from '../../server/src/services/pike13.client';
import type { InstructorProfile, EventRequest, InstructorAssignment } from '../../server/src/generated/prisma/client';

process.env.NODE_ENV = 'test';
import app from '../../server/src/app';

// Small centroid dataset for tests
const TEST_CENTROIDS = [
  { zip: '90210', lat: 34.0901, lng: -118.4065 },
  { zip: '90211', lat: 34.0885, lng: -118.3853 },
];

let instructorA: InstructorProfile;
let instructorB: InstructorProfile;

// Create test fixtures
beforeAll(async () => {
  instructorA = await prisma.instructorProfile.create({
    data: {
      pike13UserId: 'consent-instructor-A',
      displayName: 'Consent Instructor A',
      email: 'consent-a@example.com',
      topics: ['python-intro'],
      homeZip: '90210',
      maxTravelMinutes: 60,
      serviceZips: [],
      active: true,
    },
  });

  instructorB = await prisma.instructorProfile.create({
    data: {
      pike13UserId: 'consent-instructor-B',
      displayName: 'Consent Instructor B',
      email: 'consent-b@example.com',
      topics: ['python-intro'],
      homeZip: '90211',
      maxTravelMinutes: 60,
      serviceZips: [],
      active: true,
    },
  });
});

afterAll(async () => {
  await prisma.instructorAssignment.deleteMany({
    where: {
      OR: [
        { instructorId: instructorA?.id },
        { instructorId: instructorB?.id },
      ],
    },
  }).catch(() => {});
  await prisma.eventRequest.deleteMany({
    where: { requesterEmail: 'consent-test@example.com' },
  }).catch(() => {});
  await prisma.instructorProfile.deleteMany({
    where: { pike13UserId: { in: ['consent-instructor-A', 'consent-instructor-B'] } },
  }).catch(() => {});
});

// Helpers to create an event request and assignment
async function createRequest() {
  return prisma.eventRequest.create({
    data: {
      classSlug: 'python-intro',
      requesterName: 'Consent Test Requester',
      requesterEmail: 'consent-test@example.com',
      groupType: 'school',
      expectedHeadcount: 20,
      zipCode: '90210',
      preferredDates: ['2026-06-01'],
      verificationToken: crypto.randomUUID(),
      verificationExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      status: 'new',
    },
  });
}

async function createAssignment(
  requestId: string,
  instructorId: number,
  overrides: Partial<{
    status: string;
    notifiedAt: Date;
    lastReminderAt: Date | null;
    reminderCount: number;
  }> = {},
): Promise<InstructorAssignment> {
  return prisma.instructorAssignment.create({
    data: {
      requestId,
      instructorId,
      status: overrides.status || 'pending',
      notificationToken: crypto.randomUUID(),
      notifiedAt: overrides.notifiedAt || new Date(),
      lastReminderAt: overrides.lastReminderAt !== undefined ? overrides.lastReminderAt : null,
      reminderCount: overrides.reminderCount || 0,
    },
  }) as any;
}

describe('POST /api/instructor/assignments/:id/accept', () => {
  it('returns 200 and sets status to accepted for valid token', async () => {
    const req = await createRequest();
    const assignment = await createAssignment(req.id, instructorA.id);

    const res = await request(app)
      .post(`/api/instructor/assignments/${assignment.id}/accept`)
      .send({ token: assignment.notificationToken });

    expect(res.status).toBe(200);

    const updated = await prisma.instructorAssignment.findUnique({ where: { id: assignment.id } });
    expect(updated!.status).toBe('accepted');
    expect(updated!.respondedAt).not.toBeNull();
  });

  it('returns 400 for invalid token', async () => {
    const req = await createRequest();
    const assignment = await createAssignment(req.id, instructorA.id);

    const res = await request(app)
      .post(`/api/instructor/assignments/${assignment.id}/accept`)
      .send({ token: 'wrong-token' });

    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown assignment ID', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app)
      .post(`/api/instructor/assignments/${fakeId}/accept`)
      .send({ token: 'any-token' });

    expect(res.status).toBe(404);
  });

  it('returns 400 when token is missing', async () => {
    const req = await createRequest();
    const assignment = await createAssignment(req.id, instructorA.id);

    const res = await request(app)
      .post(`/api/instructor/assignments/${assignment.id}/accept`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('is idempotent — returns 200 when already accepted', async () => {
    const req = await createRequest();
    const assignment = await createAssignment(req.id, instructorA.id, { status: 'accepted' });

    const res = await request(app)
      .post(`/api/instructor/assignments/${assignment.id}/accept`)
      .send({ token: assignment.notificationToken });

    expect(res.status).toBe(200);
    // Status should still be accepted
    const still = await prisma.instructorAssignment.findUnique({ where: { id: assignment.id } });
    expect(still!.status).toBe('accepted');
  });

  it('accepts token from query string', async () => {
    const req = await createRequest();
    const assignment = await createAssignment(req.id, instructorA.id);

    const res = await request(app)
      .post(`/api/instructor/assignments/${assignment.id}/accept?token=${assignment.notificationToken}`);

    expect(res.status).toBe(200);
  });
});

describe('POST /api/instructor/assignments/:id/decline', () => {
  it('returns 200 and sets status to declined for valid token', async () => {
    const req = await createRequest();
    const assignment = await createAssignment(req.id, instructorA.id);

    const res = await request(app)
      .post(`/api/instructor/assignments/${assignment.id}/decline`)
      .send({ token: assignment.notificationToken });

    expect(res.status).toBe(200);

    const updated = await prisma.instructorAssignment.findUnique({ where: { id: assignment.id } });
    expect(updated!.status).toBe('declined');
    expect(updated!.respondedAt).not.toBeNull();
  });

  it('returns 400 for invalid token', async () => {
    const req = await createRequest();
    const assignment = await createAssignment(req.id, instructorA.id);

    const res = await request(app)
      .post(`/api/instructor/assignments/${assignment.id}/decline`)
      .send({ token: 'bad-token' });

    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown assignment ID', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app)
      .post(`/api/instructor/assignments/${fakeId}/decline`)
      .send({ token: 'any' });

    expect(res.status).toBe(404);
  });

  it('is idempotent — returns 200 when already declined', async () => {
    const req = await createRequest();
    const assignment = await createAssignment(req.id, instructorA.id, { status: 'declined' });

    const res = await request(app)
      .post(`/api/instructor/assignments/${assignment.id}/decline`)
      .send({ token: assignment.notificationToken });

    expect(res.status).toBe(200);
  });
});

describe('InstructorService.sendReminders — timeout path', () => {
  it('marks assignment timed_out when elapsed time exceeds INSTRUCTOR_TIMEOUT_HOURS', async () => {
    // Set timeout to 24 hours via env, then create an assignment with notifiedAt 25 hours ago
    process.env.INSTRUCTOR_TIMEOUT_HOURS = '24';
    process.env.INSTRUCTOR_REMINDER_INTERVAL_HOURS = '8';

    const req = await createRequest();
    const oldNotifiedAt = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
    const assignment = await createAssignment(req.id, instructorA.id, {
      notifiedAt: oldNotifiedAt,
    });

    const transport = new InMemoryEmailTransport();
    const emailService = new EmailService(transport);
    const mockPike13 = new MockPike13Client();
    const matchingService = new MatchingService(prisma, mockPike13, TEST_CENTROIDS);
    const instructorService = new InstructorService(prisma);

    await instructorService.sendReminders(emailService, matchingService);

    const updated = await prisma.instructorAssignment.findUnique({ where: { id: assignment.id } });
    expect(updated!.status).toBe('timed_out');
  });

  it('sends a reminder email when hoursSinceLast >= INSTRUCTOR_REMINDER_INTERVAL_HOURS', async () => {
    process.env.INSTRUCTOR_TIMEOUT_HOURS = '24';
    process.env.INSTRUCTOR_REMINDER_INTERVAL_HOURS = '8';

    const req = await createRequest();
    // notifiedAt 9 hours ago (within 24h timeout, but past 8h reminder interval)
    const notifiedAt = new Date(Date.now() - 9 * 60 * 60 * 1000);
    const assignment = await createAssignment(req.id, instructorA.id, {
      notifiedAt,
      reminderCount: 0,
    });

    const transport = new InMemoryEmailTransport();
    const emailService = new EmailService(transport);
    const mockPike13 = new MockPike13Client();
    const matchingService = new MatchingService(prisma, mockPike13, TEST_CENTROIDS);
    const instructorService = new InstructorService(prisma);

    await instructorService.sendReminders(emailService, matchingService);

    // Should have sent a reminder email to instructorA
    const reminderEmails = transport.sent.filter((e) => e.to === 'consent-a@example.com');
    expect(reminderEmails.length).toBeGreaterThan(0);
    expect(reminderEmails[0].subject).toContain('Reminder');

    // reminderCount should be incremented
    const updated = await prisma.instructorAssignment.findUnique({ where: { id: assignment.id } });
    expect(updated!.reminderCount).toBe(1);
  });
});

describe('InstructorService.advanceToNextInstructor', () => {
  it('creates a new assignment for the next candidate after decline', async () => {
    // Set up: instructorA declines, instructorB should get a new assignment
    // MockPike13 returns slots for instructorB
    const mockPike13 = new MockPike13Client();
    const SLOT = { start: new Date('2026-06-01T10:00:00Z'), end: new Date('2026-06-01T11:00:00Z') };
    mockPike13.setSlots('consent-instructor-B', [SLOT]);

    const transport = new InMemoryEmailTransport();
    const emailService = new EmailService(transport);
    const matchingService = new MatchingService(prisma, mockPike13, TEST_CENTROIDS);

    const req = await createRequest();
    const declinedAssignment = await createAssignment(req.id, instructorA.id, {
      status: 'declined',
    });

    const instructorService = new InstructorService(prisma);
    await instructorService.advanceToNextInstructor(declinedAssignment, emailService, matchingService);

    // A new assignment should exist for instructorB
    const newAssignment = await prisma.instructorAssignment.findFirst({
      where: { requestId: req.id, instructorId: instructorB.id },
    });
    expect(newAssignment).not.toBeNull();
    expect(newAssignment!.status).toBe('pending');

    // A notification email should have been sent to instructorB
    const notifyEmails = transport.sent.filter((e) => e.to === 'consent-b@example.com');
    expect(notifyEmails.length).toBeGreaterThan(0);
  });

  it('sends admin notification when no more candidates available', async () => {
    // All instructors already have assignments for this request — no more candidates
    const mockPike13 = new MockPike13Client();
    // Both instructors have no slots → no candidates from findMatchingInstructors
    // (MockPike13 returns [] by default)

    const transport = new InMemoryEmailTransport();
    const emailService = new EmailService(transport);
    const matchingService = new MatchingService(prisma, mockPike13, TEST_CENTROIDS);

    const req = await createRequest();
    // Both instructors already declined
    const assignmentA = await createAssignment(req.id, instructorA.id, { status: 'declined' });
    await createAssignment(req.id, instructorB.id, { status: 'declined' });

    const instructorService = new InstructorService(prisma);
    await instructorService.advanceToNextInstructor(assignmentA, emailService, matchingService);

    // Admin notification should have been sent
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@jointheleague.org';
    const adminEmails = transport.sent.filter((e) => e.to === adminEmail);
    expect(adminEmails.length).toBeGreaterThan(0);
    // Should flag no_match_available
    const adminMsg = adminEmails[0];
    expect(adminMsg.subject.toLowerCase()).toMatch(/no|match/i);
  });
});
