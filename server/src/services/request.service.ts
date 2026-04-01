/**
 * RequestService — manages EventRequest lifecycle.
 */

import { ulid } from 'ulid';
import { ServiceError } from '../errors';

export interface CreateRequestInput {
  classSlug: string;
  requesterName: string;
  requesterEmail: string;
  groupType: string;
  expectedHeadcount: number;
  zipCode: string;
  preferredDates: string[];
  locationFreeText?: string;
  externalRegistrationUrl?: string;
  siteControl?: string;
  siteReadiness?: string;
  marketingCapability?: string;
  registeredSiteId?: number;
}

const DEFAULT_VERIFICATION_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

export class RequestService {
  constructor(private prisma: any) {}

  async createRequest(input: CreateRequestInput) {
    const verificationToken = crypto.randomUUID();
    const expiryMs =
      Number(process.env.VERIFICATION_EXPIRY_MS) || DEFAULT_VERIFICATION_EXPIRY_MS;
    const verificationExpiresAt = new Date(Date.now() + expiryMs);

    return this.prisma.eventRequest.create({
      data: {
        classSlug: input.classSlug,
        requesterName: input.requesterName,
        requesterEmail: input.requesterEmail,
        groupType: input.groupType,
        expectedHeadcount: input.expectedHeadcount,
        zipCode: input.zipCode,
        preferredDates: input.preferredDates,
        locationFreeText: input.locationFreeText,
        externalRegistrationUrl: input.externalRegistrationUrl,
        siteControl: input.siteControl,
        siteReadiness: input.siteReadiness,
        marketingCapability: input.marketingCapability,
        registeredSiteId: input.registeredSiteId,
        verificationToken,
        verificationExpiresAt,
        status: 'unverified',
      },
    });
  }

  async getRequest(id: string) {
    return this.prisma.eventRequest.findUnique({ where: { id } });
  }

  async verifyRequest(
    id: string,
    token: string,
    matchingService?: any,
    emailService?: any,
    asanaService?: any,
    siteService?: any,
  ) {
    const request = await this.prisma.eventRequest.findUnique({ where: { id } });
    if (!request) {
      throw new ServiceError('Request not found', 404);
    }

    // Idempotent: already verified
    if (request.status === 'new') {
      return request;
    }

    if (request.verificationToken !== token) {
      throw new ServiceError('Invalid verification token', 400);
    }

    const now = new Date();
    if (new Date(request.verificationExpiresAt) < now) {
      throw new ServiceError('Verification link has expired', 410);
    }

    // Move to new status
    const threadDomain = process.env.THREAD_DOMAIN?.trim();
    const emailThreadAddress = threadDomain
      ? `req-${ulid().toLowerCase()}@threads.${threadDomain}`
      : null;

    const updated = await this.prisma.eventRequest.update({
      where: { id },
      data: {
        status: 'new',
        emailThreadAddress: emailThreadAddress || undefined,
      },
    });

    let asanaTaskId: string | null = null;
    if (asanaService?.createRequestTask) {
      try {
        const task = await asanaService.createRequestTask({
          id: updated.id,
          classSlug: updated.classSlug,
          requesterName: updated.requesterName,
          requesterEmail: updated.requesterEmail,
          zipCode: updated.zipCode,
          preferredDates: Array.isArray(updated.preferredDates) ? updated.preferredDates : [],
          groupType: updated.groupType,
          expectedHeadcount: updated.expectedHeadcount,
        });
        asanaTaskId = task?.gid || null;
      } catch (error) {
        console.warn('RequestService: Asana task creation failed', error);
      }

      if (asanaTaskId) {
        await this.prisma.eventRequest.update({
          where: { id: updated.id },
          data: { asanaTaskId },
        });
      }
    }

    // Trigger instructor matching if services provided
    if (matchingService && emailService) {
      try {
        const { candidates } = await matchingService.findMatchingInstructors({
          zip: request.zipCode,
          classSlug: request.classSlug,
        });

        const preferredDates: string[] = Array.isArray(request.preferredDates)
          ? request.preferredDates
          : [];

        for (const candidate of candidates) {
          const notificationToken = crypto.randomUUID();
          const assignment = await this.prisma.instructorAssignment.create({
            data: {
              requestId: id,
              instructorId: candidate.instructorId,
              status: 'pending',
              notificationToken,
              notifiedAt: new Date(),
            },
          });

          try {
            await emailService.sendMatchNotification({
              to: candidate.email,
              assignmentId: assignment.id,
              notificationToken,
              requestId: id,
              classTitle: request.classSlug,
              requesterName: request.requesterName,
              zipCode: request.zipCode,
              preferredDates,
              replyTo: emailThreadAddress || undefined,
            });
          } catch {
            // Continue even if one email fails
          }
        }

        try {
          await emailService.sendAdminNewRequestNotification({
            requestId: updated.id,
            classTitle: updated.classSlug,
            requesterName: updated.requesterName,
            replyTo: emailThreadAddress || undefined,
          });
        } catch {
          // Continue even if admin email fails
        }
      } catch {
        // Don't fail the verification if matching fails
      }
    }

    if (updated.registeredSiteId && siteService?.getSiteRepBySiteId && emailService?.sendSiteRepNotification) {
      try {
        const siteRep = await siteService.getSiteRepBySiteId(updated.registeredSiteId);
        if (siteRep) {
          await emailService.sendSiteRepNotification(
            siteRep,
            {
              id: updated.id,
              classSlug: updated.classSlug,
              requesterName: updated.requesterName,
              preferredDates: Array.isArray(updated.preferredDates) ? updated.preferredDates : [],
              zipCode: updated.zipCode,
            },
            emailThreadAddress || undefined,
          );
        }
      } catch {
        // Site rep notification should not block verification
      }
    }

    if (asanaTaskId) {
      return {
        ...updated,
        asanaTaskId,
        emailThreadAddress: emailThreadAddress || updated.emailThreadAddress,
      };
    }

    return {
      ...updated,
      emailThreadAddress: emailThreadAddress || updated.emailThreadAddress,
    };
  }

  async expireUnverified() {
    const now = new Date();
    const result = await this.prisma.eventRequest.deleteMany({
      where: {
        status: 'unverified',
        verificationExpiresAt: { lt: now },
      },
    });
    return result.count;
  }
}
