import request from 'supertest';

process.env.NODE_ENV = 'test';

import app from '../../server/src/app';
import { ServiceRegistry } from '../../server/src/services/service.registry';

const services = ServiceRegistry.create('UI');
const prisma = services.prisma;

function agent() {
  return request.agent(app);
}

async function loginAdmin(a: ReturnType<typeof agent>) {
  await a
    .post('/api/auth/test-login')
    .send({ email: 'admin@test.com', displayName: 'Admin', role: 'ADMIN' })
    .expect(200);
}

async function loginPike13Admin(a: ReturnType<typeof agent>) {
  await a
    .post('/api/auth/test-login')
    .send({ pike13UserId: `admin-eq-${Date.now()}`, role: 'admin', displayName: 'Pike13 Admin' })
    .expect(200);
}

beforeEach(async () => {
  await services.clearAll();
});

describe('GET /api/admin/email-queue', () => {
  it('requires admin auth', async () => {
    const a = agent();
    await a.get('/api/admin/email-queue').expect(401);
  });

  it('returns empty list initially', async () => {
    const a = agent();
    await loginAdmin(a);
    const res = await a.get('/api/admin/email-queue').expect(200);
    expect(res.body.rows).toHaveLength(0);
    expect(res.body.total).toBe(0);
  });

  it('filters by status', async () => {
    const a = agent();
    await loginAdmin(a);

    // Create some queue entries
    await services.emailQueue.enqueue({ to: 'a@test.com', subject: 'A', text: 'A' });
    await services.emailQueue.enqueue({ to: 'b@test.com', subject: 'B', text: 'B' });

    // Default (no status) returns failed/dead only — our entries are pending
    const resPending = await a.get('/api/admin/email-queue?status=pending').expect(200);
    expect(resPending.body.rows).toHaveLength(2);

    const resFailed = await a.get('/api/admin/email-queue?status=failed').expect(200);
    expect(resFailed.body.rows).toHaveLength(0);
  });

  it('rejects invalid status', async () => {
    const a = agent();
    await loginAdmin(a);
    await a.get('/api/admin/email-queue?status=bogus').expect(400);
  });

  it('paginates results', async () => {
    const a = agent();
    await loginAdmin(a);

    for (let i = 0; i < 5; i++) {
      await services.emailQueue.enqueue({ to: `p${i}@test.com`, subject: `P${i}`, text: `P${i}` });
    }

    const res = await a.get('/api/admin/email-queue?status=pending&page=1&limit=2').expect(200);
    expect(res.body.rows).toHaveLength(2);
    expect(res.body.total).toBe(5);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(2);
  });
});

describe('POST /api/admin/email-queue/:id/retry', () => {
  it('requires admin auth', async () => {
    const a = agent();
    await a.post('/api/admin/email-queue/some-id/retry').expect(401);
  });

  it('resets a dead email to pending', async () => {
    const a = agent();
    await loginAdmin(a);

    // Create a queue entry and manually set it to dead
    const entry = await services.emailQueue.enqueue({ to: 'dead@test.com', subject: 'Dead', text: 'Dead' });
    await prisma.emailQueue.update({
      where: { id: entry.id },
      data: { status: 'dead', attempts: 5, lastError: 'Test error' },
    });

    const res = await a.post(`/api/admin/email-queue/${entry.id}/retry`).expect(200);
    expect(res.body.status).toBe('pending');
    expect(res.body.attempts).toBe(0);
    expect(res.body.lastError).toBeNull();
  });

  it('returns 422 for non-dead email', async () => {
    const a = agent();
    await loginAdmin(a);

    const entry = await services.emailQueue.enqueue({ to: 'pending@test.com', subject: 'Pending', text: 'Pending' });

    await a.post(`/api/admin/email-queue/${entry.id}/retry`).expect(422);
  });

  it('returns 404 for nonexistent entry', async () => {
    const a = agent();
    await loginAdmin(a);

    await a.post('/api/admin/email-queue/nonexistent-id/retry').expect(404);
  });
});

describe('PUT /api/admin/requests/:id — eventCapacity', () => {
  it('sets eventCapacity', async () => {
    const a = agent();
    await loginPike13Admin(a);

    // Create an event request first
    const eventReq = await prisma.eventRequest.create({
      data: {
        classSlug: 'python-intro',
        requesterName: 'Cap Test',
        requesterEmail: 'cap@test.com',
        groupType: 'public',
        expectedHeadcount: 30,
        zipCode: '90210',
        verificationToken: `tok-cap-${Date.now()}`,
        verificationExpiresAt: new Date(Date.now() + 3600000),
        status: 'confirmed',
      },
    });

    const res = await a
      .put(`/api/admin/requests/${eventReq.id}`)
      .send({ eventCapacity: 50 })
      .expect(200);

    expect(res.body.eventCapacity).toBe(50);

    // Verify in DB
    const updated = await prisma.eventRequest.findUnique({ where: { id: eventReq.id } });
    expect(updated!.eventCapacity).toBe(50);
  });

  it('clears eventCapacity with null', async () => {
    const a = agent();
    await loginPike13Admin(a);

    const eventReq = await prisma.eventRequest.create({
      data: {
        classSlug: 'python-intro',
        requesterName: 'Cap Null Test',
        requesterEmail: 'capnull@test.com',
        groupType: 'public',
        expectedHeadcount: 30,
        zipCode: '90210',
        verificationToken: `tok-capn-${Date.now()}`,
        verificationExpiresAt: new Date(Date.now() + 3600000),
        status: 'confirmed',
        eventCapacity: 50,
      },
    });

    const res = await a
      .put(`/api/admin/requests/${eventReq.id}`)
      .send({ eventCapacity: null })
      .expect(200);

    expect(res.body.eventCapacity).toBeNull();
  });

  it('rejects invalid eventCapacity', async () => {
    const a = agent();
    await loginPike13Admin(a);

    const eventReq = await prisma.eventRequest.create({
      data: {
        classSlug: 'python-intro',
        requesterName: 'Cap Invalid',
        requesterEmail: 'capinv@test.com',
        groupType: 'public',
        expectedHeadcount: 30,
        zipCode: '90210',
        verificationToken: `tok-capi-${Date.now()}`,
        verificationExpiresAt: new Date(Date.now() + 3600000),
        status: 'confirmed',
      },
    });

    await a
      .put(`/api/admin/requests/${eventReq.id}`)
      .send({ eventCapacity: -5 })
      .expect(422);

    await a
      .put(`/api/admin/requests/${eventReq.id}`)
      .send({ eventCapacity: 3.5 })
      .expect(422);
  });
});
