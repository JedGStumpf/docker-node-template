import request from 'supertest';
import { prisma } from '../../server/src/services/prisma';
import { SiteService } from '../../server/src/services/site.service';

process.env.NODE_ENV = 'test';
import app from '../../server/src/app';

const suffix = `${Date.now()}`;
const repEmail = `site-rep-auth-${suffix}@example.com`;
let siteId = 0;
let siteRepId = 0;

async function seedSiteRep() {
  const service = new SiteService(prisma);
  const token = await service.createInvitation(repEmail, 'Auth Rep');
  const result = await service.registerSite(
    token,
    {
      name: `Auth Site ${suffix}`,
      address: '123 Auth St',
      city: 'Los Angeles',
      state: 'CA',
      zipCode: '90001',
    },
    {
      displayName: 'Auth Rep',
    },
  );
  siteId = result.site.id;
  siteRepId = result.rep.id;
}

afterAll(async () => {
  await prisma.siteRepSession.deleteMany({ where: { siteRepId } }).catch(() => {});
  await prisma.siteRep.deleteMany({ where: { id: siteRepId } }).catch(() => {});
  await prisma.siteInvitation.deleteMany({ where: { contactEmail: repEmail } }).catch(() => {});
  await prisma.registeredSite.deleteMany({ where: { id: siteId } }).catch(() => {});
});

describe('Site rep magic-link auth + profile routes', () => {
  it('POST /api/auth/magic-link/request returns 200 for unknown email', async () => {
    const res = await request(app)
      .post('/api/auth/magic-link/request')
      .send({ email: 'missing-site-rep@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /api/auth/magic-link/verify creates a SITE_REP session and allows profile access', async () => {
    await seedSiteRep();

    const service = new SiteService(prisma);
    const token = await service.createMagicLink(repEmail);
    expect(token).toBeTruthy();

    const agent = request.agent(app);
    const verify = await agent.post('/api/auth/magic-link/verify').send({ token });
    expect(verify.status).toBe(200);
    expect(verify.body.siteRepId).toBe(siteRepId);

    const profile = await agent.get('/api/site-rep/profile');
    expect(profile.status).toBe(200);
    expect(profile.body.siteRep.email).toBe(repEmail);
    expect(profile.body.site.id).toBe(siteId);
  });

  it('POST /api/auth/magic-link/verify rejects replay token (single-use)', async () => {
    const service = new SiteService(prisma);
    const token = await service.createMagicLink(repEmail);

    const first = await request(app).post('/api/auth/magic-link/verify').send({ token });
    expect(first.status).toBe(200);

    const second = await request(app).post('/api/auth/magic-link/verify').send({ token });
    expect(second.status).toBe(401);
  });

  it('GET /api/site-rep/profile enforces auth guards', async () => {
    const unauth = await request(app).get('/api/site-rep/profile');
    expect(unauth.status).toBe(401);

    const pike13Agent = request.agent(app);
    await pike13Agent
      .post('/api/auth/test-login')
      .send({ pike13UserId: 'instructor-site-rep-auth', role: 'instructor' })
      .expect(200);

    const wrongRole = await pike13Agent.get('/api/site-rep/profile');
    expect(wrongRole.status).toBe(403);
  });

  it('PUT /api/site-rep/profile updates allowed fields and ignores extras', async () => {
    const service = new SiteService(prisma);
    const token = await service.createMagicLink(repEmail);

    const agent = request.agent(app);
    await agent.post('/api/auth/magic-link/verify').send({ token }).expect(200);

    const update = await agent.put('/api/site-rep/profile').send({
      address: '456 Updated Ave',
      capacity: 42,
      unknownField: 'ignored',
    });

    expect(update.status).toBe(200);
    expect(update.body.address).toBe('456 Updated Ave');
    expect(update.body.capacity).toBe(42);
    expect(update.body.unknownField).toBeUndefined();
  });
});
