/**
 * Tests for ticket 007:
 * - timeoutAt set on new assignments (advanceToNextInstructor + verifyRequest)
 * - handleAssignmentResponse('accept') sets assignedInstructorId on EventRequest
 * - sendReminders uses timeoutAt for timeout detection
 * - Timed-out assignments set timed_out and advance to next instructor
 * - Admin notified when no candidates remain
 */
import { prisma } from '../../server/src/services/prisma';
import { InstructorService } from '../../server/src/services/instructor.service';
import { InMemoryEmailTransport, EmailService } from '../../server/src/services/email.service';
import { MatchingService } from '../../server/src/services/matching.service';
import { MockPike13Client } from '../../server/src/services/pike13.client';
import type { InstructorProfile } from '../../server/src/generated/prisma/client';

const TEST_CENTROIDS = [
  { zip: '99110', lat: 34.0901, lng: -118.4065 },
  { zip: '99111', lat: 34.0885, lng: -118.3853 },
];

let instructorX: InstructorProfile;
let instructorY: InstructorProfile;

beforeAll(async () => {
  instructorX = await prisma.instructorProfile.create({
    data: {
      pike13UserId: 'timeout-instructor-X',
      displayName: 'Timeout Instructor X',
      email: 'timeout-x@example.com',
      topics: ['timeout-test'],
      homeZip: '99110',
      maxTravelMinutes: 60,
      serviceZips: [],
      active: true,
    },
  });
  instructorY = await prisma.instructorProfile.create({
    data: {
      pike13UserId: 'timeout-instructor-Y',
      displayName: 'Timeout Instructor Y',
      email: 'timeout-y@example.com',
      topics: ['timeout-test'],
      homeZip: '99111',
      maxTravelMinutes: 60,
      serviceZips: [],
      active: true,
    },
  });
});

afterAll(async () => {
  await prisma.instructorAssignment.deleteMany({
    where: { OR: [{ instructorId: instructorX?.id }, { instructorId: instructorY?.id }] },
  }).catch(() => {});
  await prisma.eventRequest.deleteMany({
    where: { requesterEmail: 'timeout-test@example.com' },
  }).catch(() => {});
  await prisma.instructorProfile.deleteMany({
    where: { pike13UserId: { in: ['timeout-instructor-X', 'timeout-instructor-Y'] } },
  }).catch(() => {});
});

async function createRequest(overrides: Record<string, any> = {}) {
  return prisma.eventRequest.create({
    data: {
      classSlug: 'timeout-test',
      requesterName: 'Timeout Requester',
      requesterEmail: 'timeout-test@example.com',
      groupType: 'school',
      expectedHeadcount: 20,
      zipCode: '99110',
      preferredDates: ['2026-06-01'],
      verificationToken: crypto.randomUUID(),
      verificationExpiresAt: new Date(Date.now() + 3600_000),
      status: 'new',
      ...overrides,
    },
  });
}

async function createAssignment(
  requestId: string,
  instructorId: number,
  overrides: Record<string, any> = {},
) {
  return prisma.instructorAssignment.create({
    data: {
      requestId,
      instructorId,
      status: 'pending',
      notificationToken: crypto.randomUUID(),
      notifiedAt: new Date(),
      ...overrides,
    },
  });
}

function makeServices() {
  const transport = new InMemoryEmailTransport();
  const emailService = new EmailService(transport);
  const pike13 = new MockPike13Client();
  // Configure mock slots so matching service finds candidates
  const slotStart = new Date(Date.now() + 86400_000);
  const futureSlot = { start: slotStart, end: new Date(slotStart.getTime() + 3600_000) };
  pike13.setSlots('timeout-instructor-X', [futureSlot]);
  pike13.setSlots('timeout-instructor-Y', [futureSlot]);
  const matchingService = new MatchingService(prisma, pike13, TEST_CENTROIDS);
  const instructorService = new InstructorService(prisma);
  return { transport, emailService, pike13, matchingService, instructorService };
}

describe('Ticket 007: Instructor timeout & assignedInstructorId', () => {
  describe('advanceToNextInstructor sets timeoutAt', () => {
    it('new assignment created by advanceToNextInstructor has timeoutAt', async () => {
      const { emailService, matchingService, instructorService } = makeServices();
      const req = await createRequest();
      const assignment = await createAssignment(req.id, instructorX.id);

      await instructorService.advanceToNextInstructor(assignment, emailService, matchingService);

      const allAssignments = await prisma.instructorAssignment.findMany({
        where: { requestId: req.id },
        orderBy: { createdAt: 'asc' },
      });
      const newAssignment = allAssignments.find(a => a.id !== assignment.id);
      expect(newAssignment).toBeDefined();
      expect(newAssignment!.timeoutAt).not.toBeNull();
      // timeoutAt should be roughly 48 hours from now (default ASSIGNMENT_TIMEOUT_HOURS)
      const diffMs = new Date(newAssignment!.timeoutAt!).getTime() - Date.now();
      expect(diffMs).toBeGreaterThan(47 * 3600_000);
      expect(diffMs).toBeLessThan(49 * 3600_000);
    });
  });

  describe('handleAssignmentResponse sets assignedInstructorId', () => {
    it('accept sets assignedInstructorId on the EventRequest', async () => {
      const { instructorService } = makeServices();
      const req = await createRequest();
      const assignment = await createAssignment(req.id, instructorX.id);

      await instructorService.handleAssignmentResponse(
        assignment.id,
        assignment.notificationToken,
        'accept',
      );

      const updated = await prisma.eventRequest.findUnique({ where: { id: req.id } });
      expect(updated!.assignedInstructorId).toBe(instructorX.id);
    });

    it('decline does not set assignedInstructorId', async () => {
      const { instructorService } = makeServices();
      const req = await createRequest();
      const assignment = await createAssignment(req.id, instructorX.id);

      await instructorService.handleAssignmentResponse(
        assignment.id,
        assignment.notificationToken,
        'decline',
      );

      const updated = await prisma.eventRequest.findUnique({ where: { id: req.id } });
      expect(updated!.assignedInstructorId).toBeNull();
    });
  });

  describe('sendReminders uses timeoutAt for timeout detection', () => {
    it('times out an assignment whose timeoutAt is in the past', async () => {
      const { emailService, matchingService, instructorService } = makeServices();
      const req = await createRequest();
      // Assignment with timeoutAt 1 hour ago
      const assignment = await createAssignment(req.id, instructorX.id, {
        timeoutAt: new Date(Date.now() - 3600_000),
      });

      await instructorService.sendReminders(emailService, matchingService);

      const updated = await prisma.instructorAssignment.findUnique({ where: { id: assignment.id } });
      expect(updated!.status).toBe('timed_out');
    });

    it('does not time out an assignment whose timeoutAt is in the future', async () => {
      const { emailService, matchingService, instructorService } = makeServices();
      const req = await createRequest();
      const assignment = await createAssignment(req.id, instructorX.id, {
        timeoutAt: new Date(Date.now() + 48 * 3600_000),
        notifiedAt: new Date(Date.now() - 1 * 3600_000), // 1 hour ago, not enough for reminder
      });

      await instructorService.sendReminders(emailService, matchingService);

      const updated = await prisma.instructorAssignment.findUnique({ where: { id: assignment.id } });
      expect(updated!.status).toBe('pending');
    });

    it('notifies admin when no more candidates after timeout', async () => {
      const { transport, emailService, matchingService, instructorService } = makeServices();
      const req = await createRequest({ zipCode: '00001' }); // No instructors near this zip
      const assignmentA = await createAssignment(req.id, instructorX.id, {
        timeoutAt: new Date(Date.now() - 3600_000),
      });
      // Also assign Y so both are excluded
      await createAssignment(req.id, instructorY.id, {
        status: 'declined',
      });

      await instructorService.sendReminders(emailService, matchingService);

      const updatedA = await prisma.instructorAssignment.findUnique({ where: { id: assignmentA.id } });
      expect(updatedA!.status).toBe('timed_out');

      // Admin should have been notified about no more candidates
      const adminEmails = transport.sent.filter(
        (m: any) => m.subject && /no.*match|new.*request/i.test(m.subject),
      );
      expect(adminEmails.length).toBeGreaterThanOrEqual(1);
    });

    it('sends a reminder when interval elapsed but not timed out', async () => {
      const { transport, emailService, matchingService, instructorService } = makeServices();
      const req = await createRequest();
      const assignment = await createAssignment(req.id, instructorX.id, {
        timeoutAt: new Date(Date.now() + 48 * 3600_000),
        notifiedAt: new Date(Date.now() - 10 * 3600_000), // 10 hours ago
        lastReminderAt: null,
        reminderCount: 0,
      });

      await instructorService.sendReminders(emailService, matchingService);

      const updated = await prisma.instructorAssignment.findUnique({ where: { id: assignment.id } });
      expect(updated!.reminderCount).toBe(1);
      expect(updated!.lastReminderAt).not.toBeNull();
      expect(transport.sent.length).toBeGreaterThanOrEqual(1);
    });
  });
});
