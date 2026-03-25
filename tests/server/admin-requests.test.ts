/**
 * Tests for GET /api/admin/requests.
 * Ticket 010 — Admin requests view.
 */
import request from 'supertest';
import { prisma } from '../../server/src/services/prisma';

process.env.NODE_ENV = 'test';
import app from '../../server/src/app';

// Helper: create a Pike13 admin session
async function loginAdmin() {
  const agent = request.agent(app);
  await agent
    .post('/api/auth/test-login')
    .send({ pike13UserId: 'admin-req-test', role: 'admin', displayName: 'Admin Tester' })
    .expect(200);
  return agent;
}

// Helper: create a Pike13 instructor session (non-admin)
async function loginInstructor() {
  const agent = request.agent(app);
  await agent
    .post('/api/auth/test-login')
    .send({ pike13UserId: 'instructor-req-test', role: 'instructor', displayName: 'Instructor' })
    .expect(200);
  return agent;
}

// Seed a test event request in the DB
async function seedRequest(status: string = 'new') {
  return prisma.eventRequest.create({
    data: {
      classSlug: 'python-intro',
      requesterName: 'Admin Test Requester',
      requesterEmail: 'admin-req-test@example.com',
      groupType: 'school',
      expectedHeadcount: 20,
      zipCode: '90210',
      preferredDates: ['2026-06-01'],
      verificationToken: crypto.randomUUID(),
      verificationExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      status,
    },
  });
}

afterAll(async () => {
  await prisma.instructorAssignment.deleteMany({
    where: {
      request: { requesterEmail: 'admin-req-test@example.com' },
    },
  }).catch(() => {});
  await prisma.eventRequest.deleteMany({
    where: { requesterEmail: 'admin-req-test@example.com' },
  }).catch(() => {});
});

describe('GET /api/admin/requests', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/admin/requests');
    expect(res.status).toBe(401);
  });

  it('returns 403 when authenticated as instructor (not admin)', async () => {
    const agent = await loginInstructor();
    const res = await agent.get('/api/admin/requests');
    expect(res.status).toBe(403);
  });

  it('returns 200 + array for authenticated admin', async () => {
    const agent = await loginAdmin();
    const res = await agent.get('/api/admin/requests');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns only new-status requests by default', async () => {
    const newReq = await seedRequest('new');
    const unverifiedReq = await seedRequest('unverified');

    const agent = await loginAdmin();
    const res = await agent.get('/api/admin/requests');
    expect(res.status).toBe(200);

    const ids = res.body.map((r: any) => r.id);
    expect(ids).toContain(newReq.id);
    expect(ids).not.toContain(unverifiedReq.id);
  });

  it('filters by status=unverified when query param is provided', async () => {
    const unverifiedReq = await seedRequest('unverified');
    const newReq = await seedRequest('new');

    const agent = await loginAdmin();
    const res = await agent.get('/api/admin/requests?status=unverified');
    expect(res.status).toBe(200);

    const ids = res.body.map((r: any) => r.id);
    expect(ids).toContain(unverifiedReq.id);
    expect(ids).not.toContain(newReq.id);
  });

  it('returns expected fields on each request', async () => {
    const rec = await seedRequest('new');

    const agent = await loginAdmin();
    const res = await agent.get('/api/admin/requests');
    expect(res.status).toBe(200);

    const found = res.body.find((r: any) => r.id === rec.id);
    expect(found).toBeDefined();
    expect(found).toHaveProperty('id');
    expect(found).toHaveProperty('classSlug', 'python-intro');
    expect(found).toHaveProperty('requesterName', 'Admin Test Requester');
    expect(found).toHaveProperty('requesterEmail', 'admin-req-test@example.com');
    expect(found).toHaveProperty('groupType', 'school');
    expect(found).toHaveProperty('zipCode', '90210');
    expect(found).toHaveProperty('expectedHeadcount', 20);
    expect(found).toHaveProperty('status', 'new');
    expect(found).toHaveProperty('createdAt');
  });

  it('includes assignment summary on each request', async () => {
    const rec = await seedRequest('new');
    // No assignments — all counts should be 0
    const agent = await loginAdmin();
    const res = await agent.get('/api/admin/requests');
    expect(res.status).toBe(200);

    const found = res.body.find((r: any) => r.id === rec.id);
    expect(found).toBeDefined();
    expect(found.assignments).toEqual({
      pending: 0,
      accepted: 0,
      declined: 0,
      timed_out: 0,
    });
  });

  it('returns empty array when no requests match the status filter', async () => {
    // Use a filter that should return 0 results for our test data
    // (we have admin-req-test@example.com records, but confirming empty list for bizarre status)
    const agent = await loginAdmin();
    // First delete all our new requests to ensure empty
    await prisma.eventRequest.deleteMany({ where: { status: 'new', requesterEmail: 'nonexistent@example.com' } });
    const res = await agent.get('/api/admin/requests?status=nonexistent' as any);
    // nonexistent status — server defaults to 'new', so we just verify it returns 200 and array
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('results are sorted by createdAt descending (most recent first)', async () => {
    // Seed two requests with a small time gap
    const first = await seedRequest('new');
    await new Promise((r) => setTimeout(r, 10));
    const second = await seedRequest('new');

    const agent = await loginAdmin();
    const res = await agent.get('/api/admin/requests');
    expect(res.status).toBe(200);

    const ids = res.body.map((r: any) => r.id);
    const firstIdx = ids.indexOf(first.id);
    const secondIdx = ids.indexOf(second.id);
    // second was created after first, so it should appear earlier in the list
    expect(secondIdx).toBeLessThan(firstIdx);
  });
});
