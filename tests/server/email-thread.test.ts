import request from 'supertest';
import { prisma } from '../../server/src/services/prisma';
import { SiteService } from '../../server/src/services/site.service';

process.env.NODE_ENV = 'test';
import app, { registry } from '../../server/src/app';

const suffix = `${Date.now()}`;
const requesterEmail = `email-thread-requester-${suffix}@example.com`;
const contactEmail = `email-thread-contact-${suffix}@example.com`;
const seededRequestIds: string[] = [];
let siteRepId = 0;
let siteId = 0;

function getSentEmails() {
  return ((registry.email as any).transport?.sent || []) as Array<any>;
}

function resetSentEmails() {
  const transport = (registry.email as any).transport;
  if (transport?.reset) transport.reset();
}

beforeAll(async () => {
  process.env.THREAD_DOMAIN = 'example.org';
  process.env.ASANA_ACCESS_TOKEN = 'test-token';
  process.env.ASANA_PROJECT_GID = 'test-project';

  const siteService = new SiteService(prisma);
  const token = await siteService.createInvitation(contactEmail, 'Thread Contact');
  const result = await siteService.registerSite(
    token,
    {
      name: `Thread Site ${suffix}`,
      address: '123 Thread Lane',
      city: 'Denver',
      state: 'CO',
      zipCode: '80202',
    },
    { displayName: 'Thread Rep' },
  );

  siteId = result.site.id;
  siteRepId = result.rep.id;
});

afterAll(async () => {
  await prisma.instructorAssignment.deleteMany({ where: { requestId: { in: seededRequestIds } } }).catch(() => {});
  await prisma.eventRequest.deleteMany({ where: { id: { in: seededRequestIds } } }).catch(() => {});
  await prisma.siteRepSession.deleteMany({ where: { siteRepId } }).catch(() => {});
  await prisma.siteRep.deleteMany({ where: { id: siteRepId } }).catch(() => {});
  await prisma.siteInvitation.deleteMany({ where: { contactEmail } }).catch(() => {});
  await prisma.registeredSite.deleteMany({ where: { id: siteId } }).catch(() => {});
});

describe('Request verification thread + Asana + site rep notification', () => {
  it('stores email thread + Asana task and sends site rep notification with Reply-To', async () => {
    resetSentEmails();

    const rec = await prisma.eventRequest.create({
      data: {
        classSlug: 'python-intro',
        requesterName: 'Thread Requester',
        requesterEmail,
        groupType: 'school',
        expectedHeadcount: 25,
        zipCode: '80202',
        preferredDates: ['2026-09-10'],
        verificationToken: crypto.randomUUID(),
        verificationExpiresAt: new Date(Date.now() + 3600_000),
        status: 'unverified',
        registeredSiteId: siteId,
      },
    });
    seededRequestIds.push(rec.id);

    const res = await request(app)
      .post(`/api/requests/${rec.id}/verify`)
      .send({ token: rec.verificationToken });

    expect(res.status).toBe(200);

    const updated = await prisma.eventRequest.findUnique({ where: { id: rec.id } });
    expect(updated?.status).toBe('new');
    expect(updated?.emailThreadAddress).toMatch(/^req-[0-9A-HJKMNP-TV-Z]+@threads\.example\.org$/i);
    expect(updated?.asanaTaskId).toBeTruthy();

    const sent = getSentEmails();
    const repEmail = sent.find((m) => m.to === contactEmail || m.to?.includes('email-thread-contact'));
    expect(repEmail).toBeTruthy();
    expect(repEmail.replyTo).toBe(updated?.emailThreadAddress);
  });
});
