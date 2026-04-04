/**
 * Tests for Give Lively donation link (ticket 010, sprint 005).
 *
 * Admin can set / clear giveLivelyUrl via PUT /api/admin/requests/:id.
 * URL must start with https:// or be null/empty.
 * giveLivelyUrl is returned in the public event info endpoint.
 */
process.env.NODE_ENV = 'test';

import request from 'supertest';
import app from '../../server/src/app';
import { ServiceRegistry } from '../../server/src/services/service.registry';

const services = ServiceRegistry.create('UI');
const prisma = services.prisma;

beforeEach(async () => {
  await services.clearAll();
});

async function makeAdminAgent() {
  const agent = request.agent(app);
  await agent
    .post('/api/auth/test-login')
    .send({ pike13UserId: 'give-lively-admin', role: 'admin', displayName: 'Admin' })
    .expect(200);
  return agent;
}

async function createRequest(extra: Record<string, any> = {}) {
  return prisma.eventRequest.create({
    data: {
      classSlug: 'give-lively-test',
      requesterName: 'Give Lively Requester',
      requesterEmail: 'give-lively@example.com',
      groupType: 'school',
      expectedHeadcount: 10,
      zipCode: '90210',
      verificationToken: crypto.randomUUID(),
      verificationExpiresAt: new Date(Date.now() + 3_600_000),
      status: 'discussing',
      ...extra,
    },
  });
}

describe('Give Lively URL — admin API', () => {
  it('sets giveLivelyUrl with a valid HTTPS URL', async () => {
    const agent = await makeAdminAgent();
    const req = await createRequest();

    const res = await agent
      .put(`/api/admin/requests/${req.id}`)
      .send({ giveLivelyUrl: 'https://donate.givelively.org/test-event' })
      .expect(200);

    expect(res.body.giveLivelyUrl).toBe('https://donate.givelively.org/test-event');

    // Also assert DB state
    const updated = await prisma.eventRequest.findUnique({ where: { id: req.id } });
    expect(updated!.giveLivelyUrl).toBe('https://donate.givelively.org/test-event');
  });

  it('clears giveLivelyUrl when set to null', async () => {
    const agent = await makeAdminAgent();
    const req = await createRequest({ giveLivelyUrl: 'https://donate.givelively.org/test' });

    const res = await agent
      .put(`/api/admin/requests/${req.id}`)
      .send({ giveLivelyUrl: null })
      .expect(200);

    expect(res.body.giveLivelyUrl).toBeNull();

    const updated = await prisma.eventRequest.findUnique({ where: { id: req.id } });
    expect(updated!.giveLivelyUrl).toBeNull();
  });

  it('clears giveLivelyUrl when set to empty string', async () => {
    const agent = await makeAdminAgent();
    const req = await createRequest({ giveLivelyUrl: 'https://donate.givelively.org/test' });

    const res = await agent
      .put(`/api/admin/requests/${req.id}`)
      .send({ giveLivelyUrl: '' })
      .expect(200);

    expect(res.body.giveLivelyUrl).toBeNull();
  });

  it('rejects non-HTTPS URL with 400', async () => {
    const agent = await makeAdminAgent();
    const req = await createRequest();

    const res = await agent
      .put(`/api/admin/requests/${req.id}`)
      .send({ giveLivelyUrl: 'http://insecure.example.com/donate' })
      .expect(400);

    expect(res.body.error).toMatch(/https/i);
  });

  it('rejects HTTP URL without host with 400', async () => {
    const agent = await makeAdminAgent();
    const req = await createRequest();

    await agent
      .put(`/api/admin/requests/${req.id}`)
      .send({ giveLivelyUrl: 'ftp://not-https.example.com/donate' })
      .expect(400);
  });

  it('returns 404 for non-existent request', async () => {
    const agent = await makeAdminAgent();
    await agent
      .put('/api/admin/requests/00000000-0000-0000-0000-000000000000')
      .send({ giveLivelyUrl: 'https://donate.givelively.org/test' })
      .expect(404);
  });

  it('requires Pike13 admin authentication', async () => {
    const req = await createRequest();

    // Unauthenticated request should return 401
    await request(app)
      .put(`/api/admin/requests/${req.id}`)
      .send({ giveLivelyUrl: 'https://donate.givelively.org/test' })
      .expect(401);
  });
});

describe('Give Lively URL — public event info endpoint', () => {
  it('includes giveLivelyUrl in public event info when set', async () => {
    const regToken = `give-lively-pub-tok-${Date.now()}`;
    const req = await prisma.eventRequest.create({
      data: {
        classSlug: 'give-lively-public-test',
        requesterName: 'Give Lively Requester',
        requesterEmail: 'give-lively@example.com',
        groupType: 'school',
        expectedHeadcount: 10,
        zipCode: '90210',
        verificationToken: crypto.randomUUID(),
        verificationExpiresAt: new Date(Date.now() + 3_600_000),
        status: 'dates_proposed',
        registrationToken: regToken,
        proposedDates: ['2026-08-01'],
        minHeadcount: 5,
        giveLivelyUrl: 'https://donate.givelively.org/public-event',
      },
    });

    const res = await request(app)
      .get(`/api/events/${req.id}?token=${regToken}`)
      .expect(200);

    expect(res.body.giveLivelyUrl).toBe('https://donate.givelively.org/public-event');
  });

  it('returns null giveLivelyUrl when not set', async () => {
    const regToken = `give-lively-null-tok-${Date.now()}`;
    const req = await prisma.eventRequest.create({
      data: {
        classSlug: 'give-lively-null-test',
        requesterName: 'Give Lively Requester',
        requesterEmail: 'give-lively@example.com',
        groupType: 'school',
        expectedHeadcount: 10,
        zipCode: '90210',
        verificationToken: crypto.randomUUID(),
        verificationExpiresAt: new Date(Date.now() + 3_600_000),
        status: 'dates_proposed',
        registrationToken: regToken,
        proposedDates: ['2026-08-01'],
      },
    });

    const res = await request(app)
      .get(`/api/events/${req.id}?token=${regToken}`)
      .expect(200);

    expect(res.body.giveLivelyUrl).toBeNull();
  });
});
