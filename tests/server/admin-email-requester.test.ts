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
  // Clean up EmailQueue rows linked to test requests
  const testRequests = await prisma.eventRequest.findMany({
    where: { requesterEmail: TEST_EMAIL },
    select: { id: true },
  });
  const ids = testRequests.map((r: { id: string }) => r.id);
  if (ids.length > 0) {
    await prisma.emailQueue.deleteMany({ where: { requestId: { in: ids } } }).catch(() => {});
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
