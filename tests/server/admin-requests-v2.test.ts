import request from 'supertest';
import { prisma } from '../../server/src/services/prisma';

process.env.NODE_ENV = 'test';
import app from '../../server/src/app';

const suffix = `${Date.now()}`;
const emailBase = `admin-requests-v2-${suffix}@example.com`;
const seededIds: string[] = [];

async function loginPike13Admin() {
  const agent = request.agent(app);
  await agent
    .post('/api/auth/test-login')
    .send({ pike13UserId: `admin-v2-${suffix}`, role: 'admin', displayName: 'Admin V2' })
    .expect(200);
  return agent;
}

async function seedRequest(data: Partial<{ status: string; requesterName: string; requesterEmail: string }> = {}) {
  const rec = await prisma.eventRequest.create({
    data: {
      classSlug: 'python-intro',
      requesterName: data.requesterName || `Requester ${suffix}`,
      requesterEmail: data.requesterEmail || emailBase,
      groupType: 'school',
      expectedHeadcount: 12,
      zipCode: '90210',
      preferredDates: ['2026-08-01'],
      verificationToken: crypto.randomUUID(),
      verificationExpiresAt: new Date(Date.now() + 3600_000),
      status: (data.status as any) || 'new',
      emailThreadAddress: `req-${crypto.randomUUID()}@threads.example.org`,
      asanaTaskId: `task-${crypto.randomUUID()}`,
    },
  });
  seededIds.push(rec.id);
  return rec;
}

afterAll(async () => {
  await prisma.instructorAssignment.deleteMany({ where: { requestId: { in: seededIds } } }).catch(() => {});
  await prisma.eventRequest.deleteMany({ where: { id: { in: seededIds } } }).catch(() => {});
});

describe('Admin requests v2 routes', () => {
  it('returns envelope for paginated search/filter query', async () => {
    await seedRequest({ status: 'new', requesterName: 'Alice Requester', requesterEmail: `alice-${suffix}@example.com` });
    await seedRequest({ status: 'discussing', requesterName: 'Bob Requester', requesterEmail: `bob-${suffix}@example.com` });

    const agent = await loginPike13Admin();
    const res = await agent.get('/api/admin/requests?status=discussing&search=Bob&page=1&limit=10');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.requests)).toBe(true);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(10);
    expect(res.body.requests.every((r: any) => r.status === 'discussing')).toBe(true);
  });

  it('returns request detail by id', async () => {
    const rec = await seedRequest({ status: 'new', requesterName: 'Detail Requester' });
    const agent = await loginPike13Admin();

    const res = await agent.get(`/api/admin/requests/${rec.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(rec.id);
    expect(res.body.asanaTaskId).toBeTruthy();
    expect(res.body.emailThreadAddress).toBeTruthy();
  });

  it('updates request status and rejects invalid status', async () => {
    const rec = await seedRequest({ status: 'new', requesterName: 'Status Requester' });
    const agent = await loginPike13Admin();

    const ok = await agent.put(`/api/admin/requests/${rec.id}/status`).send({ status: 'scheduled' });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('dates_proposed');

    const bad = await agent.put(`/api/admin/requests/${rec.id}/status`).send({ status: 'invalid-status' });
    expect(bad.status).toBe(400);
  });
});
