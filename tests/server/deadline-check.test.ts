/**
 * Tests for the deadline-check scheduled job handler.
 * Ticket 008, Sprint 003.
 */
import { prisma, initPrisma } from '../../server/src/services/prisma';
import { RegistrationService } from '../../server/src/services/registration.service';
import { EmailService, InMemoryEmailTransport } from '../../server/src/services/email.service';

process.env.NODE_ENV = 'test';

const TEST_EMAIL = 'deadline-test@example.com';
const THREAD_ADDR = 'thread-deadline@example.com';

let registrationService: RegistrationService;
let emailTransport: InMemoryEmailTransport;
let emailService: EmailService;

beforeAll(async () => {
  await initPrisma();
  registrationService = new RegistrationService(prisma);
  emailTransport = new InMemoryEmailTransport();
  emailService = new EmailService(emailTransport);
});

async function seedRequest(extra: Record<string, any> = {}) {
  return prisma.eventRequest.create({
    data: {
      classSlug: 'art-101',
      requesterName: 'Deadline Tester',
      requesterEmail: TEST_EMAIL,
      groupType: 'school',
      expectedHeadcount: 20,
      zipCode: '90210',
      preferredDates: ['2026-06-01'],
      verificationToken: crypto.randomUUID(),
      verificationExpiresAt: new Date(Date.now() + 3600_000),
      status: 'dates_proposed',
      registrationToken: crypto.randomUUID(),
      proposedDates: ['2026-06-15', '2026-06-22'],
      minHeadcount: 5,
      emailThreadAddress: THREAD_ADDR,
      ...extra,
    },
  });
}

/** Simulates what the deadline-check handler does */
async function runDeadlineCheckHandler() {
  const now = new Date();
  const expiredRequests = await prisma.eventRequest.findMany({
    where: {
      status: 'dates_proposed',
      votingDeadline: { lt: now },
    },
  });
  for (const req of expiredRequests) {
    const result = await registrationService.checkAndFinalizeThreshold(req.id);
    if (!result) {
      const adminEmail = process.env.ADMIN_EMAIL || 'admin@jointheleague.org';
      const eventDetails = {
        title: req.classSlug,
        requestId: req.id,
        replyTo: req.emailThreadAddress || undefined,
      };
      if (req.requesterEmail) {
        await emailService.sendDeadlineExpiredNotification(req.requesterEmail, eventDetails);
      }
      await emailService.sendDeadlineExpiredNotification(adminEmail, eventDetails);
    }
  }
}

afterEach(async () => {
  emailTransport.reset();
  await prisma.registration.deleteMany({
    where: { request: { requesterEmail: TEST_EMAIL } },
  }).catch(() => {});
  await prisma.instructorAssignment.deleteMany({
    where: { request: { requesterEmail: TEST_EMAIL } },
  }).catch(() => {});
  await prisma.eventRequest.deleteMany({
    where: { requesterEmail: TEST_EMAIL },
  }).catch(() => {});
});

describe('Ticket 008: deadline-check handler', () => {
  it('sends deadline-expired notification when no date meets threshold', async () => {
    const req = await seedRequest({
      votingDeadline: new Date(Date.now() - 3600_000), // expired 1 hour ago
    });
    // Add registration below threshold (2 kids, threshold is 5)
    await prisma.registration.create({
      data: {
        requestId: req.id,
        attendeeName: 'Alice',
        attendeeEmail: 'alice@example.com',
        numberOfKids: 2,
        availableDates: ['2026-06-15'],
      },
    });

    await runDeadlineCheckHandler();

    // Should send to requester + admin = 2 emails
    expect(emailTransport.sent.length).toBe(2);
    const recipients = emailTransport.sent.map(m => m.to);
    expect(recipients).toContain(TEST_EMAIL);
    expect(recipients).toContain('admin@jointheleague.org');
    expect(emailTransport.sent[0].subject).toContain('Voting Deadline Expired');
  });

  it('auto-finalizes if a date meets threshold even with expired deadline', async () => {
    const req = await seedRequest({
      votingDeadline: new Date(Date.now() - 3600_000), // expired
    });
    // 5 kids meets the threshold
    await prisma.registration.create({
      data: {
        requestId: req.id,
        attendeeName: 'Bob',
        attendeeEmail: 'bob@example.com',
        numberOfKids: 5,
        availableDates: ['2026-06-15'],
      },
    });

    await runDeadlineCheckHandler();

    // Should auto-finalize, no expired notification
    expect(emailTransport.sent.length).toBe(0);
    const updated = await prisma.eventRequest.findUnique({ where: { id: req.id } });
    expect(updated!.status).toBe('confirmed');
  });

  it('does NOT affect requests with future deadline', async () => {
    await seedRequest({
      votingDeadline: new Date(Date.now() + 86400_000), // tomorrow
    });

    await runDeadlineCheckHandler();

    expect(emailTransport.sent.length).toBe(0);
  });

  it('does NOT affect already-confirmed requests', async () => {
    await seedRequest({
      status: 'confirmed',
      votingDeadline: new Date(Date.now() - 3600_000), // expired, but already confirmed
    });

    await runDeadlineCheckHandler();

    expect(emailTransport.sent.length).toBe(0);
  });

  it('does NOT affect requests without a votingDeadline', async () => {
    await seedRequest({
      votingDeadline: null,
    });

    await runDeadlineCheckHandler();

    expect(emailTransport.sent.length).toBe(0);
  });

  it('request remains in dates_proposed after deadline expires (admin must act)', async () => {
    const req = await seedRequest({
      votingDeadline: new Date(Date.now() - 3600_000),
    });

    await runDeadlineCheckHandler();

    const updated = await prisma.eventRequest.findUnique({ where: { id: req.id } });
    expect(updated!.status).toBe('dates_proposed');
  });
});
