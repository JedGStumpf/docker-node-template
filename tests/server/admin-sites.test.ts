import request from 'supertest';
import { prisma } from '../../server/src/services/prisma';

process.env.NODE_ENV = 'test';
import app from '../../server/src/app';

const suffix = `${Date.now()}`;
const contactEmail = `admin-sites-${suffix}@example.com`;
const seededSiteName = `Admin Sites ${suffix}`;
let seededSiteId = 0;

async function loginAdmin() {
  const agent = request.agent(app);
  await agent
    .post('/api/auth/test-login')
    .send({ email: `admin-sites-user-${suffix}@example.com`, displayName: 'Admin', role: 'ADMIN' })
    .expect(200);
  return agent;
}

beforeAll(async () => {
  const site = await prisma.registeredSite.create({
    data: {
      name: seededSiteName,
      address: '10 Admin Way',
      city: 'Chicago',
      state: 'IL',
      zipCode: '60601',
      active: true,
    },
  });
  seededSiteId = site.id;

  await prisma.siteRep.create({
    data: {
      email: `site-rep-admin-${suffix}@example.com`,
      displayName: 'Seed Rep',
      registeredSiteId: site.id,
    },
  });
});

afterAll(async () => {
  await prisma.siteInvitation.deleteMany({ where: { contactEmail } }).catch(() => {});
  await prisma.siteRep.deleteMany({ where: { email: { contains: `-${suffix}@example.com` } } }).catch(() => {});
  await prisma.registeredSite.deleteMany({ where: { name: { contains: `${suffix}` } } }).catch(() => {});
});

describe('Admin sites routes', () => {
  it('requires admin auth', async () => {
    const res = await request(app).get('/api/admin/sites');
    expect(res.status).toBe(401);
  });

  it('creates invitation and rejects duplicate pending invite', async () => {
    const agent = await loginAdmin();

    const first = await agent
      .post('/api/admin/sites/invite')
      .send({ contactEmail, contactName: 'First Contact' });

    expect(first.status).toBe(201);
    expect(first.body.token).toBeTruthy();

    const second = await agent
      .post('/api/admin/sites/invite')
      .send({ contactEmail, contactName: 'First Contact' });

    expect(second.status).toBe(409);
  });

  it('lists sites and returns details for one site', async () => {
    const agent = await loginAdmin();

    const list = await agent.get('/api/admin/sites');
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    const found = list.body.find((s: any) => s.id === seededSiteId);
    expect(found).toBeTruthy();
    expect(found.rep).toBeTruthy();

    const detail = await agent.get(`/api/admin/sites/${seededSiteId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.id).toBe(seededSiteId);
    expect(Array.isArray(detail.body.reps)).toBe(true);
  });

  it('updates site fields including active flag', async () => {
    const agent = await loginAdmin();

    const update = await agent
      .put(`/api/admin/sites/${seededSiteId}`)
      .send({ active: false, roomNotes: 'Updated notes' });

    expect(update.status).toBe(200);
    expect(update.body.active).toBe(false);
    expect(update.body.roomNotes).toBe('Updated notes');
  });
});
