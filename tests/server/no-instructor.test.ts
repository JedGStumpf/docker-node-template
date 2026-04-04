/**
 * Tests for the no-instructor-available workflow (ticket 010, sprint 005).
 *
 * When all instructors decline or time out:
 * - EventRequest.status transitions to "no_instructor"
 * - Admin alert email is sent
 *
 * Admin can re-open matching via POST /api/admin/requests/:id/reopen-matching.
 */
process.env.NODE_ENV = 'test';

import request from 'supertest';
import app from '../../server/src/app';
import { ServiceRegistry } from '../../server/src/services/service.registry';
import { InMemoryEmailTransport, EmailService } from '../../server/src/services/email.service';
import { InstructorService } from '../../server/src/services/instructor.service';
import { MatchingService } from '../../server/src/services/matching.service';
import { MockPike13Client } from '../../server/src/services/pike13.client';

const services = ServiceRegistry.create('UI');
const prisma = services.prisma;

let instructorA: any;

beforeAll(async () => {
  // Clean up any stale data first
  await prisma.instructorAssignment
    .deleteMany({ where: { request: { requesterEmail: 'no-instructor-requester@example.com' } } })
    .catch(() => {});
  await prisma.eventRequest
    .deleteMany({ where: { requesterEmail: 'no-instructor-requester@example.com' } })
    .catch(() => {});
  await prisma.instructorProfile
    .deleteMany({ where: { pike13UserId: 'no-instructor-A' } })
    .catch(() => {});

  instructorA = await prisma.instructorProfile.create({
    data: {
      pike13UserId: 'no-instructor-A',
      displayName: 'No Instructor A',
      email: 'no-instructor-a@example.com',
      topics: ['no-instructor-test'],
      homeZip: '77001',
      maxTravelMinutes: 60,
      serviceZips: [],
      active: true,
    },
  });
});

afterAll(async () => {
  await prisma.instructorAssignment
    .deleteMany({ where: { instructorId: instructorA?.id } })
    .catch(() => {});
  await prisma.eventRequest
    .deleteMany({ where: { requesterEmail: 'no-instructor-requester@example.com' } })
    .catch(() => {});
  await prisma.instructorProfile
    .deleteMany({ where: { pike13UserId: 'no-instructor-A' } })
    .catch(() => {});
});

beforeEach(async () => {
  // Clean up requests and assignments but NOT instructor profiles
  await prisma.instructorAssignment
    .deleteMany({ where: { instructorId: instructorA?.id } })
    .catch(() => {});
  await prisma.eventRequest
    .deleteMany({ where: { requesterEmail: 'no-instructor-requester@example.com' } })
    .catch(() => {});
  const transport = services.email.getTransport();
  if (transport instanceof InMemoryEmailTransport) {
    transport.reset();
  }
});

async function createRequestWithDeclinedInstructor() {
  const req = await prisma.eventRequest.create({
    data: {
      classSlug: 'no-instructor-test',
      requesterName: 'No Instructor Requester',
      requesterEmail: 'no-instructor-requester@example.com',
      groupType: 'school',
      expectedHeadcount: 15,
      zipCode: '00001', // remote zip with no nearby instructors
      verificationToken: crypto.randomUUID(),
      verificationExpiresAt: new Date(Date.now() + 3_600_000),
      status: 'discussing',
    },
  });

  // Add the only instructor assignment as declined
  await prisma.instructorAssignment.create({
    data: {
      requestId: req.id,
      instructorId: instructorA.id,
      status: 'declined',
      notificationToken: crypto.randomUUID(),
      notifiedAt: new Date(),
      respondedAt: new Date(),
    },
  });

  return req;
}

function makeServices() {
  const transport = new InMemoryEmailTransport();
  const emailService = new EmailService(transport);
  const pike13 = new MockPike13Client();
  // No slots available so matching returns no candidates
  const matchingService = new MatchingService(prisma, pike13, []);
  const instructorService = new InstructorService(prisma);
  return { transport, emailService, matchingService, instructorService };
}

describe('No instructor available workflow', () => {
  it('transitions request to no_instructor when all decline and no candidates remain', async () => {
    const { emailService, matchingService, instructorService } = makeServices();
    const req = await createRequestWithDeclinedInstructor();

    // Simulate a timed-out assignment with no remaining candidates
    const timedOutAssignment = await prisma.instructorAssignment.findFirst({
      where: { requestId: req.id },
    });

    await instructorService.advanceToNextInstructor(
      timedOutAssignment,
      emailService,
      matchingService,
    );

    const updated = await prisma.eventRequest.findUnique({ where: { id: req.id } });
    expect(updated!.status).toBe('no_instructor');
  });

  it('sends admin alert email when transitioning to no_instructor', async () => {
    const { transport, emailService, matchingService, instructorService } = makeServices();
    const req = await createRequestWithDeclinedInstructor();

    const timedOutAssignment = await prisma.instructorAssignment.findFirst({
      where: { requestId: req.id },
    });

    await instructorService.advanceToNextInstructor(
      timedOutAssignment,
      emailService,
      matchingService,
    );

    const noInstructorEmail = transport.sent.find(
      (m) => m.subject && /no instructor/i.test(m.subject),
    );
    expect(noInstructorEmail).toBeTruthy();
    expect(noInstructorEmail!.text).toContain(req.id);
  });

  it('sendReminders transitions to no_instructor and alerts admin when all instructors time out', async () => {
    const { transport, emailService, matchingService, instructorService } = makeServices();
    const req = await prisma.eventRequest.create({
      data: {
        classSlug: 'no-instructor-timeout-test',
        requesterName: 'No Instructor Requester',
        requesterEmail: 'no-instructor-requester@example.com',
        groupType: 'school',
        expectedHeadcount: 15,
        zipCode: '00001',
        verificationToken: crypto.randomUUID(),
        verificationExpiresAt: new Date(Date.now() + 3_600_000),
        status: 'discussing',
      },
    });

    // Assignment with timeoutAt in the past and no other candidates
    await prisma.instructorAssignment.create({
      data: {
        requestId: req.id,
        instructorId: instructorA.id,
        status: 'pending',
        notificationToken: crypto.randomUUID(),
        notifiedAt: new Date(Date.now() - 50 * 3_600_000),
        timeoutAt: new Date(Date.now() - 1_000), // already timed out
      },
    });

    await instructorService.sendReminders(emailService, matchingService);

    const updated = await prisma.eventRequest.findUnique({ where: { id: req.id } });
    expect(updated!.status).toBe('no_instructor');

    const adminEmail = transport.sent.find(
      (m) => m.subject && /no instructor/i.test(m.subject),
    );
    expect(adminEmail).toBeTruthy();
  });
});

describe('Admin reopen-matching route', () => {
  async function makeAdminAgent() {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/test-login')
      .send({ pike13UserId: 'no-instructor-admin', role: 'admin', displayName: 'Admin' })
      .expect(200);
    return agent;
  }

  it('resets no_instructor request to discussing', async () => {
    const agent = await makeAdminAgent();
    const req = await prisma.eventRequest.create({
      data: {
        classSlug: 'reopen-test',
        requesterName: 'No Instructor Requester',
        requesterEmail: 'no-instructor-requester@example.com',
        groupType: 'school',
        expectedHeadcount: 10,
        zipCode: '12345',
        verificationToken: crypto.randomUUID(),
        verificationExpiresAt: new Date(Date.now() + 3_600_000),
        status: 'no_instructor',
      },
    });

    const res = await agent
      .post(`/api/admin/requests/${req.id}/reopen-matching`)
      .expect(200);

    expect(res.body.status).toBe('discussing');

    const updated = await prisma.eventRequest.findUnique({ where: { id: req.id } });
    expect(updated!.status).toBe('discussing');
  });

  it('returns 422 when request is not in no_instructor status', async () => {
    const agent = await makeAdminAgent();
    const req = await prisma.eventRequest.create({
      data: {
        classSlug: 'reopen-test-invalid',
        requesterName: 'No Instructor Requester',
        requesterEmail: 'no-instructor-requester@example.com',
        groupType: 'school',
        expectedHeadcount: 10,
        zipCode: '12345',
        verificationToken: crypto.randomUUID(),
        verificationExpiresAt: new Date(Date.now() + 3_600_000),
        status: 'discussing',
      },
    });

    await agent
      .post(`/api/admin/requests/${req.id}/reopen-matching`)
      .expect(422);
  });

  it('returns 404 for non-existent request', async () => {
    const agent = await makeAdminAgent();
    await agent
      .post('/api/admin/requests/00000000-0000-0000-0000-000000000000/reopen-matching')
      .expect(404);
  });

  it('requires Pike13 admin authentication', async () => {
    const req = await prisma.eventRequest.create({
      data: {
        classSlug: 'reopen-auth-test',
        requesterName: 'No Instructor Requester',
        requesterEmail: 'no-instructor-requester@example.com',
        groupType: 'school',
        expectedHeadcount: 10,
        zipCode: '12345',
        verificationToken: crypto.randomUUID(),
        verificationExpiresAt: new Date(Date.now() + 3_600_000),
        status: 'no_instructor',
      },
    });

    // Unauthenticated request should fail
    await request(app)
      .post(`/api/admin/requests/${req.id}/reopen-matching`)
      .expect(401);
  });
});
