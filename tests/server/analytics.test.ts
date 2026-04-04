/**
 * Tests for GET /api/admin/analytics — analytics endpoint.
 */
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../server/src/services/prisma';

process.env.NODE_ENV = 'test';
import app from '../../server/src/app';

let instructor: any;
let req1: any;
let req2: any;
let assignment1: any;

beforeAll(async () => {
  instructor = await prisma.instructorProfile.create({
    data: {
      pike13UserId: 'analytics-test-instructor',
      displayName: 'Analytics Instructor',
      email: 'analytics-instructor@example.com',
      topics: ['python-intro'],
      homeZip: '90210',
      maxTravelMinutes: 60,
    },
  });

  req1 = await prisma.eventRequest.create({
    data: {
      classSlug: 'python-intro',
      requesterName: 'Analytics Req 1',
      requesterEmail: 'analytics-req1@example.com',
      groupType: 'school',
      expectedHeadcount: 20,
      zipCode: '90210',
      preferredDates: [],
      verificationToken: `analytics-token1-${Date.now()}`,
      verificationExpiresAt: new Date(Date.now() + 86400000),
      status: 'confirmed',
    },
  });

  req2 = await prisma.eventRequest.create({
    data: {
      classSlug: 'scratch-basics',
      requesterName: 'Analytics Req 2',
      requesterEmail: 'analytics-req2@example.com',
      groupType: 'community',
      expectedHeadcount: 15,
      zipCode: '90211',
      preferredDates: [],
      verificationToken: `analytics-token2-${Date.now()}`,
      verificationExpiresAt: new Date(Date.now() + 86400000),
      status: 'completed',
    },
  });

  assignment1 = await prisma.instructorAssignment.create({
    data: {
      requestId: req1.id,
      instructorId: instructor.id,
      status: 'accepted',
      notificationToken: `analytics-notif-${Date.now()}`,
      notifiedAt: new Date(),
    },
  });
});

afterAll(async () => {
  await prisma.instructorAssignment.deleteMany({ where: { id: assignment1.id } });
  await prisma.eventRequest.deleteMany({ where: { id: { in: [req1.id, req2.id] } } });
  await prisma.instructorProfile.deleteMany({ where: { pike13UserId: 'analytics-test-instructor' } });
});

async function loginAdmin() {
  const agent = request.agent(app);
  await agent
    .post('/api/auth/test-login')
    .send({ email: 'analytics-admin@example.com', displayName: 'Analytics Admin', role: 'ADMIN' })
    .expect(200);
  return agent;
}

describe('GET /api/admin/analytics', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/admin/analytics');
    expect(res.status).toBe(401);
  });

  it('returns analytics data for admin', async () => {
    const agent = await loginAdmin();
    const res = await agent.get('/api/admin/analytics');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('eventFunnel');
    expect(res.body).toHaveProperty('instructorUtilization');
    expect(res.body).toHaveProperty('registrations');
    expect(res.body).toHaveProperty('period');
  });

  it('eventFunnel contains correct status counts for seeded data', async () => {
    const agent = await loginAdmin();
    // Use a wide period to include seeded data
    const from = new Date(Date.now() - 365 * 24 * 3600000).toISOString().split('T')[0];
    const to = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const res = await agent.get(`/api/admin/analytics?from=${from}&to=${to}`);

    expect(res.status).toBe(200);
    const funnel = res.body.eventFunnel;
    expect(funnel.confirmed).toBeGreaterThanOrEqual(1);
    expect(funnel.completed).toBeGreaterThanOrEqual(1);
    expect(funnel.total).toBeGreaterThanOrEqual(2);
  });

  it('instructorUtilization includes seeded instructor', async () => {
    const agent = await loginAdmin();
    const from = new Date(Date.now() - 365 * 24 * 3600000).toISOString().split('T')[0];
    const to = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const res = await agent.get(`/api/admin/analytics?from=${from}&to=${to}`);

    expect(res.status).toBe(200);
    const util = res.body.instructorUtilization;
    const found = util.find((u: any) => u.instructorId === instructor.id);
    expect(found).toBeDefined();
    expect(found.accepted).toBe(1);
  });

  it('returns 400 for invalid from date', async () => {
    const agent = await loginAdmin();
    const res = await agent.get('/api/admin/analytics?from=invalid-date');
    expect(res.status).toBe(400);
  });
});
