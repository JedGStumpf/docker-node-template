import { createHash } from 'node:crypto';
import { ServiceError } from '../errors';

export interface SiteRegistrationData {
  name: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  capacity?: number;
  roomNotes?: string;
}

export interface SiteRepRegistrationData {
  email: string;
  displayName: string;
}

type ZipCentroid = {
  zip: string;
  lat: number;
  lng: number;
};

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_MAGIC_LINK_TTL_MINUTES = 1440;

function tokenSha256(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class SiteService {
  private zipCentroids: Map<string, ZipCentroid> | null = null;

  constructor(private prisma: any) {}

  private async getZipCentroids(): Promise<Map<string, ZipCentroid>> {
    if (!this.zipCentroids) {
      const imported = await import('../static/zip-centroids.json', {
        assert: { type: 'json' },
      }).catch(async () => import('../static/zip-centroids.json'));
      const centroids = imported.default as ZipCentroid[];
      this.zipCentroids = new Map(centroids.map((c) => [c.zip, c]));
    }
    return this.zipCentroids;
  }

  async createInvitation(contactEmail: string, contactName: string): Promise<string> {
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    await this.prisma.siteInvitation.create({
      data: {
        token,
        contactEmail,
        contactName,
        expiresAt,
      },
    });
    return token;
  }

  async getInvitationByToken(token: string) {
    const invitation = await this.prisma.siteInvitation.findUnique({
      where: { token },
      include: { site: true },
    });
    if (!invitation) return null;
    if (invitation.usedAt) return null;
    if (new Date(invitation.expiresAt) < new Date()) return null;
    return invitation;
  }

  async registerSite(token: string, siteData: SiteRegistrationData, repData: SiteRepRegistrationData) {
    const invitation = await this.getInvitationByToken(token);
    if (!invitation) {
      throw new ServiceError('Invitation is invalid or expired', 400);
    }

    const centroids = await this.getZipCentroids();
    const zip = centroids.get(siteData.zipCode);

    const result = await this.prisma.$transaction(async (tx: any) => {
      const site = await tx.registeredSite.create({
        data: {
          name: siteData.name,
          address: siteData.address,
          city: siteData.city,
          state: siteData.state,
          zipCode: siteData.zipCode,
          lat: zip?.lat,
          lng: zip?.lng,
          capacity: siteData.capacity,
          roomNotes: siteData.roomNotes,
          active: true,
        },
      });

      const rep = await tx.siteRep.create({
        data: {
          email: repData.email,
          displayName: repData.displayName,
          registeredSiteId: site.id,
        },
      });

      await tx.siteInvitation.update({
        where: { id: invitation.id },
        data: {
          usedAt: new Date(),
          registeredSiteId: site.id,
        },
      });

      return { site, rep };
    });

    return result;
  }

  async listSites() {
    return this.prisma.registeredSite.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        city: true,
        state: true,
        zipCode: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async adminListSites() {
    return this.prisma.registeredSite.findMany({
      include: {
        reps: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getSiteDetail(id: number) {
    return this.prisma.registeredSite.findUnique({
      where: { id },
      include: {
        reps: true,
        invitations: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async updateSite(
    id: number,
    data: Partial<{
      name: string;
      address: string;
      city: string;
      state: string;
      zipCode: string;
      capacity: number | null;
      roomNotes: string | null;
      active: boolean;
    }>,
  ) {
    const updateData: Record<string, unknown> = { ...data };
    if (data.zipCode) {
      const centroids = await this.getZipCentroids();
      const zip = centroids.get(data.zipCode);
      updateData.lat = zip?.lat ?? null;
      updateData.lng = zip?.lng ?? null;
    }
    return this.prisma.registeredSite.update({
      where: { id },
      data: updateData,
    });
  }

  async createMagicLink(email: string): Promise<string> {
    const rep = await this.prisma.siteRep.findUnique({ where: { email } });
    if (!rep) {
      throw new ServiceError('Site rep not found', 404);
    }

    const rawToken = crypto.randomUUID();
    const tokenHash = tokenSha256(rawToken);
    const ttlMinutes = Number(process.env.MAGIC_LINK_TTL_MINUTES) || DEFAULT_MAGIC_LINK_TTL_MINUTES;
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    await this.prisma.siteRepSession.create({
      data: {
        siteRepId: rep.id,
        tokenHash,
        expiresAt,
      },
    });

    return rawToken;
  }

  async verifyMagicLink(rawToken: string) {
    const tokenHash = tokenSha256(rawToken);
    const session = await this.prisma.siteRepSession.findUnique({
      where: { tokenHash },
      include: {
        siteRep: {
          include: { site: true },
        },
      },
    });

    if (!session) {
      throw new ServiceError('Invalid or expired magic link', 400);
    }
    if (session.usedAt) {
      throw new ServiceError('Magic link already used', 400);
    }
    if (new Date(session.expiresAt) < new Date()) {
      throw new ServiceError('Magic link expired', 410);
    }

    await this.prisma.siteRepSession.update({
      where: { id: session.id },
      data: { usedAt: new Date() },
    });

    return session.siteRep;
  }
}
