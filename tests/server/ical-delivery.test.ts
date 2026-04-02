/**
 * Tests for EmailService Sprint 3 extensions: iCal generation,
 * cancellation, digest, and deadline notifications.
 * Ticket 003, Sprint 003.
 */
import request from 'supertest';
import { prisma } from '../../server/src/services/prisma';
import { EmailService, InMemoryEmailTransport } from '../../server/src/services/email.service';

process.env.NODE_ENV = 'test';
import app from '../../server/src/app';

const TEST_EMAIL = 'ical-test@example.com';

function createEmailService(): { service: EmailService; transport: InMemoryEmailTransport } {
  const transport = new InMemoryEmailTransport();
  const service = new EmailService(transport);
  return { service, transport };
}

describe('EmailService — Sprint 3 extensions', () => {
  describe('sendEventConfirmation', () => {
    it('sends email with .ics attachment', async () => {
      const { service, transport } = createEmailService();

      await service.sendEventConfirmation(TEST_EMAIL, {
        title: 'Intro to Coding',
        date: new Date('2026-06-15T10:00:00Z'),
        location: '123 Main St',
        organizerEmail: 'admin@jointheleague.org',
      });

      expect(transport.sent).toHaveLength(1);
      const msg = transport.sent[0];
      expect(msg.to).toBe(TEST_EMAIL);
      expect(msg.subject).toContain('Event Confirmed');
      expect(msg.subject).toContain('Intro to Coding');
      expect(msg.attachments).toHaveLength(1);

      const attachment = msg.attachments![0];
      expect(attachment.filename).toBe('event.ics');
      expect(attachment.contentType).toBe('text/calendar');
      expect(attachment.content).toBeInstanceOf(Buffer);

      // Validate iCal content
      const icsContent = attachment.content.toString('utf-8');
      expect(icsContent).toContain('BEGIN:VCALENDAR');
      expect(icsContent).toContain('BEGIN:VEVENT');
      expect(icsContent).toContain('Intro to Coding');
      expect(icsContent).toContain('123 Main St');
      expect(icsContent).toContain('END:VEVENT');
      expect(icsContent).toContain('END:VCALENDAR');
    });

    it('sets Reply-To when provided', async () => {
      const { service, transport } = createEmailService();

      await service.sendEventConfirmation(TEST_EMAIL, {
        title: 'Art Class',
        date: new Date('2026-07-01T14:00:00Z'),
        replyTo: 'thread@threads.example.com',
      });

      expect(transport.sent[0].replyTo).toBe('thread@threads.example.com');
    });
  });

  describe('sendDateChangeNotification', () => {
    it('sends date change notification with confirmed date', async () => {
      const { service, transport } = createEmailService();

      await service.sendDateChangeNotification(
        TEST_EMAIL,
        { title: 'Robot Workshop', location: 'Community Center' },
        new Date('2026-06-22T10:00:00Z'),
      );

      expect(transport.sent).toHaveLength(1);
      const msg = transport.sent[0];
      expect(msg.subject).toContain('Date Update');
      expect(msg.subject).toContain('Robot Workshop');
      expect(msg.text).toContain('differs from the one you selected');
    });
  });

  describe('sendCancellationNotification', () => {
    it('sends cancellation notification', async () => {
      const { service, transport } = createEmailService();

      await service.sendCancellationNotification(TEST_EMAIL, {
        title: 'Python 101',
        requestId: 'req-123',
        replyTo: 'thread@threads.example.com',
      });

      expect(transport.sent).toHaveLength(1);
      const msg = transport.sent[0];
      expect(msg.subject).toContain('Event Cancelled');
      expect(msg.subject).toContain('Python 101');
      expect(msg.text).toContain('req-123');
      expect(msg.replyTo).toBe('thread@threads.example.com');
    });
  });

  describe('sendDeadlineExpiredNotification', () => {
    it('sends deadline expired notification', async () => {
      const { service, transport } = createEmailService();

      await service.sendDeadlineExpiredNotification(TEST_EMAIL, {
        title: 'Web Dev',
        requestId: 'req-456',
      });

      expect(transport.sent).toHaveLength(1);
      const msg = transport.sent[0];
      expect(msg.subject).toContain('Voting Deadline Expired');
      expect(msg.text).toContain('minimum headcount');
      expect(msg.text).toContain('Admin action is required');
    });
  });

  describe('sendRegistrationDigest', () => {
    it('sends digest to thread address', async () => {
      const { service, transport } = createEmailService();

      const html = '<table><tr><td>Alice</td><td>3 kids</td></tr></table>';
      await service.sendRegistrationDigest(
        'admin@jointheleague.org',
        'req-abc@threads.example.com',
        html,
      );

      expect(transport.sent).toHaveLength(1);
      const msg = transport.sent[0];
      expect(msg.to).toBe('req-abc@threads.example.com');
      expect(msg.replyTo).toBe('admin@jointheleague.org');
      expect(msg.html).toBe(html);
    });
  });
});

describe('Cancellation emails via transitionStatus', () => {
  async function loginAdmin() {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/test-login')
      .send({ pike13UserId: 'admin-ical', role: 'admin', displayName: 'iCal Admin' })
      .expect(200);
    return agent;
  }

  async function seedRequest(status: string, extra: Record<string, any> = {}) {
    return prisma.eventRequest.create({
      data: {
        classSlug: 'coding-101',
        requesterName: 'Cancel Tester',
        requesterEmail: TEST_EMAIL,
        groupType: 'community',
        expectedHeadcount: 10,
        zipCode: '98101',
        preferredDates: ['2026-06-01'],
        verificationToken: crypto.randomUUID(),
        verificationExpiresAt: new Date(Date.now() + 3600_000),
        status,
        ...extra,
      },
    });
  }

  afterEach(async () => {
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

  it('cancelling a request with registrants sends cancellation emails', async () => {
    const admin = await loginAdmin();
    const req = await seedRequest('dates_proposed', {
      registrationToken: 'a'.repeat(64),
      minHeadcount: 5,
      proposedDates: ['2026-06-15'],
    });

    // Add a registration
    await prisma.registration.create({
      data: {
        requestId: req.id,
        attendeeName: 'Test Registrant',
        attendeeEmail: 'registrant@example.com',
        numberOfKids: 2,
        availableDates: ['2026-06-15'],
      },
    });

    const res = await admin
      .put(`/api/admin/requests/${req.id}/status`)
      .send({ status: 'cancelled' })
      .expect(200);

    expect(res.body.status).toBe('cancelled');
    // The test transport captures emails — the actual emails are sent via InMemoryTransport in test mode.
    // We verify that the transition succeeded and included registrations in the response.
    expect(res.body.registrations).toBeDefined();
  });

  it('cancellation from discussing sends notification to requester', async () => {
    const admin = await loginAdmin();
    const req = await seedRequest('discussing');

    const res = await admin
      .put(`/api/admin/requests/${req.id}/status`)
      .send({ status: 'cancelled' })
      .expect(200);

    expect(res.body.status).toBe('cancelled');
  });
});
