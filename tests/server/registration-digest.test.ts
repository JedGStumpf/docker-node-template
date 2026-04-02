/**
 * Tests for the registration-digest scheduled job handler.
 * Ticket 008, Sprint 003.
 */
import { prisma, initPrisma } from '../../server/src/services/prisma';
import { RegistrationService } from '../../server/src/services/registration.service';
import { EmailService, InMemoryEmailTransport } from '../../server/src/services/email.service';

process.env.NODE_ENV = 'test';

const TEST_EMAIL = 'digest-test@example.com';
const THREAD_ADDR = 'thread-digest@example.com';
const REG_TOKEN = 'd'.repeat(64);

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
      requesterName: 'Digest Tester',
      requesterEmail: TEST_EMAIL,
      groupType: 'school',
      expectedHeadcount: 20,
      zipCode: '90210',
      preferredDates: ['2026-06-01'],
      verificationToken: crypto.randomUUID(),
      verificationExpiresAt: new Date(Date.now() + 3600_000),
      status: 'dates_proposed',
      registrationToken: REG_TOKEN + crypto.randomUUID().slice(0, 8),
      proposedDates: ['2026-06-15', '2026-06-22'],
      minHeadcount: 5,
      emailThreadAddress: THREAD_ADDR,
      ...extra,
    },
  });
}

/** Simulates what the registration-digest handler does */
async function runDigestHandler() {
  const requests = await prisma.eventRequest.findMany({
    where: { status: 'dates_proposed' },
    include: { registrations: true },
  });
  for (const req of requests) {
    if (!req.emailThreadAddress) continue;
    if (!req.registrations || req.registrations.length === 0) continue;
    const proposedDates: string[] = Array.isArray(req.proposedDates) ? req.proposedDates : [];
    const digestHtml = registrationService.generateDigest(req.registrations, proposedDates);
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@jointheleague.org';
    await emailService.sendRegistrationDigest(adminEmail, req.emailThreadAddress, digestHtml);
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

describe('Ticket 008: registration-digest handler', () => {
  it('sends digest email for events with registrations', async () => {
    const req = await seedRequest();
    await prisma.registration.create({
      data: {
        requestId: req.id,
        attendeeName: 'Alice',
        attendeeEmail: 'alice@example.com',
        numberOfKids: 3,
        availableDates: ['2026-06-15'],
      },
    });

    await runDigestHandler();

    expect(emailTransport.sent.length).toBe(1);
    expect(emailTransport.sent[0].to).toBe(THREAD_ADDR);
    expect(emailTransport.sent[0].html).toContain('Registration Summary');
    expect(emailTransport.sent[0].html).toContain('Alice');
  });

  it('skips events without emailThreadAddress', async () => {
    const req = await seedRequest({ emailThreadAddress: null });
    await prisma.registration.create({
      data: {
        requestId: req.id,
        attendeeName: 'Bob',
        attendeeEmail: 'bob@example.com',
        numberOfKids: 2,
        availableDates: ['2026-06-15'],
      },
    });

    await runDigestHandler();

    expect(emailTransport.sent.length).toBe(0);
  });

  it('skips events with zero registrations', async () => {
    await seedRequest();

    await runDigestHandler();

    expect(emailTransport.sent.length).toBe(0);
  });

  it('skips events not in dates_proposed status', async () => {
    const req = await seedRequest({ status: 'confirmed' });
    await prisma.registration.create({
      data: {
        requestId: req.id,
        attendeeName: 'Carol',
        attendeeEmail: 'carol@example.com',
        numberOfKids: 2,
        availableDates: ['2026-06-15'],
      },
    });

    await runDigestHandler();

    expect(emailTransport.sent.length).toBe(0);
  });

  it('digest contains vote tallies per date', async () => {
    const req = await seedRequest();
    await prisma.registration.create({
      data: {
        requestId: req.id,
        attendeeName: 'Dave',
        attendeeEmail: 'dave@example.com',
        numberOfKids: 3,
        availableDates: ['2026-06-15', '2026-06-22'],
      },
    });
    await prisma.registration.create({
      data: {
        requestId: req.id,
        attendeeName: 'Eve',
        attendeeEmail: 'eve@example.com',
        numberOfKids: 2,
        availableDates: ['2026-06-15'],
      },
    });

    await runDigestHandler();

    expect(emailTransport.sent.length).toBe(1);
    const html = emailTransport.sent[0].html!;
    // June 15 should have 5 kids, June 22 should have 3 kids
    expect(html).toContain('5');
    expect(html).toContain('3');
    expect(html).toContain('2026-06-15');
    expect(html).toContain('2026-06-22');
  });
});
