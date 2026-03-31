import { createHash } from 'node:crypto';
import { prisma } from '../../server/src/services/prisma';
import { SiteService } from '../../server/src/services/site.service';
import { ServiceError } from '../../server/src/errors';

describe('SiteService', () => {
  const service = new SiteService(prisma);
  const suffix = `${Date.now()}`;
  const contactEmail = `site-contact-${suffix}@example.com`;
  const registerInviteEmail = `${suffix}-register@example.com`;
  const repEmail = `site-rep-${suffix}@example.com`;

  afterAll(async () => {
    await prisma.siteRepSession.deleteMany({
      where: {
        siteRep: {
          email: {
            in: [repEmail],
          },
        },
      },
    }).catch(() => {});
    await prisma.siteRep.deleteMany({
      where: { email: { in: [repEmail] } },
    }).catch(() => {});
    await prisma.siteInvitation.deleteMany({
      where: { contactEmail: { in: [contactEmail, registerInviteEmail] } },
    }).catch(() => {});
    await prisma.registeredSite.deleteMany({
      where: { name: { contains: `Test Site ${suffix}` } },
    }).catch(() => {});
  });

  it('creates invitation and returns it while valid', async () => {
    const token = await service.createInvitation(contactEmail, 'Site Contact');

    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(10);

    const invitation = await service.getInvitationByToken(token);
    expect(invitation).not.toBeNull();
    expect(invitation!.contactEmail).toBe(contactEmail);
    expect(invitation!.usedAt).toBeNull();
  });

  it('registerSite creates site + rep, uses invitation, and auto-populates lat/lng from ZIP', async () => {
    const token = await service.createInvitation(registerInviteEmail, 'Register Contact');

    const result = await service.registerSite(
      token,
      {
        name: `Test Site ${suffix}`,
        address: '123 Main St',
        city: 'Beverly Hills',
        state: 'CA',
        zipCode: '90210',
        capacity: 30,
        roomNotes: 'Room A',
      },
      {
        email: repEmail,
        displayName: 'Rep Name',
      },
    );

    expect(result.site.id).toBeGreaterThan(0);
    expect(result.rep.id).toBeGreaterThan(0);
    expect(result.site.zipCode).toBe('90210');
    expect(result.site.lat).toBeCloseTo(34.0901, 4);
    expect(result.site.lng).toBeCloseTo(-118.4065, 4);

    const invitationAfter = await service.getInvitationByToken(token);
    expect(invitationAfter).toBeNull();
  });

  it('createMagicLink stores hash only and verifyMagicLink marks session used', async () => {
    const rawToken = await service.createMagicLink(repEmail);

    const session = await prisma.siteRepSession.findFirst({
      where: {
        siteRep: { email: repEmail },
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(session).not.toBeNull();
    expect(session!.tokenHash).toBe(createHash('sha256').update(rawToken).digest('hex'));
    expect(session!.tokenHash).not.toBe(rawToken);

    const rep = await service.verifyMagicLink(rawToken);
    expect(rep.email).toBe(repEmail);

    const usedSession = await prisma.siteRepSession.findUnique({
      where: { id: session!.id },
    });
    expect(usedSession!.usedAt).not.toBeNull();

    await expect(service.verifyMagicLink(rawToken)).rejects.toBeInstanceOf(ServiceError);
  });

  it('verifyMagicLink rejects expired sessions', async () => {
    const rawToken = await service.createMagicLink(repEmail);
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    await prisma.siteRepSession.update({
      where: { tokenHash },
      data: {
        expiresAt: new Date(Date.now() - 60 * 1000),
      },
    });

    await expect(service.verifyMagicLink(rawToken)).rejects.toMatchObject({ statusCode: 410 });
  });
});
