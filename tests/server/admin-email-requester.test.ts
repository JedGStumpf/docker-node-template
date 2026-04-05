/**
 * Tests for POST /api/admin/requests/:id/email-requester.
 * Ticket 003 — Email requester route.
 */
import request from 'supertest';
import { prisma } from '../../server/src/services/prisma';

process.env.NODE_ENV = 'test';
import app from '../../server/src/app';

const TEST_EMAIL = 'email-requester-test@example.com';

async function loginAdmin() {
  const agent = request.agent(app);
  await agent
    .post('/api/auth/test-login')
    .send({ pike13UserId: 'admin-email-req-test', role: 'admin', displayName: 'Admin Tester' })
    .expect(200);
  return agent;
}

async function seedRequest(overrides: Record<string, any> = {}) {
  return prisma.eventRequest.create({
    data: {
      classSlug: 'python-intro',
      requesterName: 'Email Req Test',
      requesterEmail: TEST_EMAIL,
      groupType: 'school',
      expectedHeadcount: 20,
      zipCode: '90210',
      preferredDates: ['2026-06-01'],
      verificationToken: crypto.randomUUID(),
      verificationExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      status: 'new',
      emailThreadAddress: 'thread@example.com',
      ...overrides,
    },
  });
}

afterAll(async () => {
  // Clean up EmailQueue, EmailExtraction rows linked to test requests
  const testRequests = await prisma.eventRequest.findMany({
    where: { requesterEmail: TEST_EMAIL },
    select: { id: true },
  });
  const ids = testRequests.map((r: { id: string }) => r.id);
  if (ids.length > 0) {
    await prisma.emailQueue.deleteMany({ where: { requestId: { in: ids } } }).catch(() => {});
    await prisma.emailExtraction.deleteMany({ where: { requestId: { in: ids } } }).catch(() => {});
  }
  await prisma.eventRequest.deleteMany({ where: { requesterEmail: TEST_EMAIL } }).catch(() => {});
});

describe('POST /api/admin/requests/:id/email-requester', () => {
  it('returns 401 when unauthenticated', async () => {
    const testReq = await seedRequest();
    const res = await request(app)
      .post(`/api/admin/requests/${testReq.id}/email-requester`)
      .send({ subject: 'Hello', body: 'Test body' });
    expect(res.status).toBeGreaterThanOrEqual(401);
    expect(res.status).toBeLessThanOrEqual(403);
  });

  it('returns 201 with { queued: true } for a valid payload and creates EmailQueue row', async () => {
    const agent = await loginAdmin();
    const testReq = await seedRequest();

    const res = await agent
      .post(`/api/admin/requests/${testReq.id}/email-requester`)
      .send({ subject: 'Hello requester', body: 'This is the message body' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ queued: true });

    const queueRow = await prisma.emailQueue.findFirst({
      where: { requestId: testReq.id },
    });
    expect(queueRow).not.toBeNull();
    expect(queueRow!.recipient).toBe(TEST_EMAIL);
    expect(queueRow!.replyTo).toBe('thread@example.com');
    expect(queueRow!.requestId).toBe(testReq.id);
    expect(queueRow!.subject).toBe('Hello requester');
  });

  it('returns 400 when subject is missing', async () => {
    const agent = await loginAdmin();
    const testReq = await seedRequest();

    const res = await agent
      .post(`/api/admin/requests/${testReq.id}/email-requester`)
      .send({ body: 'Some body text' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when body is missing', async () => {
    const agent = await loginAdmin();
    const testReq = await seedRequest();

    const res = await agent
      .post(`/api/admin/requests/${testReq.id}/email-requester`)
      .send({ subject: 'A subject' });

    expect(res.status).toBe(400);
  });

  it('returns 422 with error no_thread_address when emailThreadAddress is null', async () => {
    const agent = await loginAdmin();
    const testReq = await seedRequest({ emailThreadAddress: null });

    const res = await agent
      .post(`/api/admin/requests/${testReq.id}/email-requester`)
      .send({ subject: 'Hello', body: 'Body text' });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('no_thread_address');
  });

  it('returns 404 when request does not exist', async () => {
    const agent = await loginAdmin();

    const res = await agent
      .post('/api/admin/requests/nonexistent-id-12345/email-requester')
      .send({ subject: 'Hello', body: 'Body text' });

    expect(res.status).toBe(404);
  });
});

describe('GET /api/admin/requests/:id/email-thread', () => {
  it('returns 401/403 when unauthenticated', async () => {
    const testReq = await seedRequest();
    const res = await request(app).get(`/api/admin/requests/${testReq.id}/email-thread`);
    expect(res.status).toBeGreaterThanOrEqual(401);
    expect(res.status).toBeLessThanOrEqual(403);
  });

  it('returns 404 for an unknown request id', async () => {
    const agent = await loginAdmin();
    const res = await agent.get('/api/admin/requests/nonexistent-id-99999/email-thread');
    expect(res.status).toBe(404);
  });

  it('returns empty arrays when no emails or extractions exist', async () => {
    const agent = await loginAdmin();
    const testReq = await seedRequest();

    const res = await agent.get(`/api/admin/requests/${testReq.id}/email-thread`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sent: [], received: [] });
  });

  it('returns sent emails sorted by createdAt ascending', async () => {
    const agent = await loginAdmin();
    const testReq = await seedRequest();

    // Create two EmailQueue rows with distinct timestamps
    const first = await prisma.emailQueue.create({
      data: {
        recipient: TEST_EMAIL,
        subject: 'First email',
        textBody: 'First body',
        status: 'pending',
        attempts: 0,
        requestId: testReq.id,
        createdAt: new Date('2026-01-01T10:00:00Z'),
      },
    });
    const second = await prisma.emailQueue.create({
      data: {
        recipient: TEST_EMAIL,
        subject: 'Second email',
        textBody: 'Second body',
        status: 'pending',
        attempts: 0,
        requestId: testReq.id,
        createdAt: new Date('2026-01-01T11:00:00Z'),
      },
    });

    const res = await agent.get(`/api/admin/requests/${testReq.id}/email-thread`);
    expect(res.status).toBe(200);
    expect(res.body.sent).toHaveLength(2);
    expect(res.body.sent[0].id).toBe(first.id);
    expect(res.body.sent[1].id).toBe(second.id);
    expect(res.body.received).toEqual([]);
  });

  it('returns received extractions sorted by createdAt ascending', async () => {
    const agent = await loginAdmin();
    const testReq = await seedRequest();

    const first = await prisma.emailExtraction.create({
      data: {
        emailId: 'email-id-001',
        requestId: testReq.id,
        actionItems: ['action1'],
        createdAt: new Date('2026-01-01T09:00:00Z'),
      },
    });
    const second = await prisma.emailExtraction.create({
      data: {
        emailId: 'email-id-002',
        requestId: testReq.id,
        actionItems: ['action2'],
        createdAt: new Date('2026-01-01T10:00:00Z'),
      },
    });

    const res = await agent.get(`/api/admin/requests/${testReq.id}/email-thread`);
    expect(res.status).toBe(200);
    expect(res.body.sent).toEqual([]);
    expect(res.body.received).toHaveLength(2);
    expect(res.body.received[0].id).toBe(first.id);
    expect(res.body.received[1].id).toBe(second.id);
  });
});
