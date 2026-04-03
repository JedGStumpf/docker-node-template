/**
 * RequestService — manages EventRequest lifecycle.
 */

import crypto from 'crypto';
import { ulid } from 'ulid';
import { ServiceError } from '../errors';
import type { MeetupService } from './meetup.service';
import type { GoogleCalendarService } from './google-calendar.service';
import type { IPike13Client } from './pike13.client';

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

export interface TransitionData {
  proposedDates?: string[];
  minHeadcount?: number;
  votingDeadline?: string; // ISO date
  confirmedDate?: string;  // ISO date — set by finalization
}

const DEFAULT_VERIFICATION_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_MIN_HEADCOUNT = Number(process.env.DEFAULT_MIN_HEADCOUNT) || 10;
const DEFAULT_VOTING_DEADLINE_DAYS = Number(process.env.DEFAULT_VOTING_DEADLINE_DAYS) || 7;

/**
 * Valid status transitions. Key = from status, value = set of allowed target statuses.
 */
const VALID_TRANSITIONS: Record<string, Set<string>> = {
  unverified: new Set(['new']),
  new: new Set(['discussing', 'cancelled']),
  discussing: new Set(['dates_proposed', 'cancelled']),
  dates_proposed: new Set(['confirmed', 'cancelled']),
  confirmed: new Set(['completed', 'cancelled']),
  // Terminal states — no transitions out
  completed: new Set(),
  cancelled: new Set(),
};

export class RequestService {
  private meetupService?: MeetupService;
  private googleCalendarService?: GoogleCalendarService;
  private pike13Client?: IPike13Client;

  constructor(private prisma: any, opts?: {
    meetupService?: MeetupService;
    googleCalendarService?: GoogleCalendarService;
    pike13Client?: IPike13Client;
  }) {
    this.meetupService = opts?.meetupService;
    this.googleCalendarService = opts?.googleCalendarService;
    this.pike13Client = opts?.pike13Client;
  }

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

        const assignmentTimeoutHours = Number(process.env.ASSIGNMENT_TIMEOUT_HOURS) || 48;
        for (const candidate of candidates) {
          const notificationToken = crypto.randomUUID();
          const assignment = await this.prisma.instructorAssignment.create({
            data: {
              requestId: id,
              instructorId: candidate.instructorId,
              status: 'pending',
              notificationToken,
              notifiedAt: new Date(),
              timeoutAt: new Date(Date.now() + assignmentTimeoutHours * 3600_000),
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

  /**
   * Validate and apply a status transition with side effects.
   * Returns the updated EventRequest record.
   */
  async transitionStatus(
    requestId: string,
    newStatus: string,
    data?: TransitionData,
    emailService?: any,
  ) {
    const request = await this.prisma.eventRequest.findUnique({
      where: { id: requestId },
      include: { site: true },
    });
    if (!request) {
      throw new ServiceError('Request not found', 404);
    }

    const currentStatus = request.status;

    // Validate transition
    const allowed = VALID_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.has(newStatus)) {
      // Idempotent: same status on non-terminal states → return as-is
      if (currentStatus === newStatus && allowed && allowed.size > 0) {
        return request;
      }
      throw new ServiceError(
        `Invalid transition: ${currentStatus} → ${newStatus}`,
        422,
      );
    }

    // Build update payload
    const updateData: Record<string, any> = { status: newStatus };

    // Side effects per transition
    if (newStatus === 'dates_proposed') {
      // Generate registration token if not already present
      if (!request.registrationToken) {
        updateData.registrationToken = crypto.randomBytes(32).toString('hex');
      }
      // Store proposed dates (required)
      if (data?.proposedDates && data.proposedDates.length > 0) {
        updateData.proposedDates = data.proposedDates;
      } else if (!request.proposedDates || request.proposedDates.length === 0) {
        throw new ServiceError(
          'proposedDates are required when transitioning to dates_proposed',
          422,
        );
      }
      // Set defaults for minHeadcount and votingDeadline if not provided
      if (data?.minHeadcount != null) {
        updateData.minHeadcount = data.minHeadcount;
      } else if (request.minHeadcount == null) {
        updateData.minHeadcount = DEFAULT_MIN_HEADCOUNT;
      }
      if (data?.votingDeadline) {
        updateData.votingDeadline = new Date(data.votingDeadline);
      } else if (request.votingDeadline == null) {
        updateData.votingDeadline = new Date(
          Date.now() + DEFAULT_VOTING_DEADLINE_DAYS * 24 * 60 * 60 * 1000,
        );
      }
    }

    if (newStatus === 'confirmed' && data?.confirmedDate) {
      updateData.confirmedDate = new Date(data.confirmedDate);
    }

    const updated = await this.prisma.eventRequest.update({
      where: { id: requestId },
      data: updateData,
      include: { site: true, registrations: true },
    });

    // Side effect: Create external events on confirmed transition
    if (newStatus === 'confirmed') {
      // 1. Meetup event (public events only)
      if (this.meetupService && updated.groupType === 'public') {
        try {
          const meetupResult = await this.meetupService.createMeetupEvent(updated);
          if (meetupResult) {
            await this.prisma.eventRequest.update({
              where: { id: requestId },
              data: {
                meetupEventId: meetupResult.meetupEventId,
                meetupEventUrl: meetupResult.meetupEventUrl,
              },
            });
          }
        } catch (err) {
          console.error('RequestService: Meetup event creation failed', err);
        }
      }

      // 2. Google Calendar event (all events)
      if (this.googleCalendarService) {
        try {
          const calEventId = await this.googleCalendarService.createCalendarEvent(updated);
          if (calEventId) {
            await this.prisma.eventRequest.update({
              where: { id: requestId },
              data: { googleCalendarEventId: calEventId },
            });
          }
        } catch (err) {
          console.error('RequestService: Google Calendar event creation failed', err);
        }
      }

      // 3. Pike13 instructor booking (when instructor is assigned)
      if (this.pike13Client && updated.assignedInstructorId) {
        try {
          const instructor = await this.prisma.instructorProfile.findUnique({
            where: { id: updated.assignedInstructorId },
          });
          if (instructor?.pike13UserId) {
            await this.pike13Client.bookInstructor(
              instructor.pike13UserId,
              updated.confirmedDate || new Date(),
              updated.classSlug,
            );
          }
        } catch (err) {
          console.error('RequestService: Pike13 booking failed', err);
        }
      }
    }

    // Side effect: Send cancellation emails after transition to cancelled
    if (newStatus === 'cancelled' && emailService) {
      const eventDetails = {
        title: updated.classSlug,
        requestId: updated.id,
        replyTo: updated.emailThreadAddress || undefined,
      };
      const recipients: string[] = [];

      // Requester
      if (updated.requesterEmail) {
        recipients.push(updated.requesterEmail);
      }

      // Assigned instructor
      if (updated.assignedInstructorId) {
        try {
          const instructor = await this.prisma.instructorProfile.findUnique({
            where: { id: updated.assignedInstructorId },
          });
          if (instructor?.email) {
            recipients.push(instructor.email);
          }
        } catch { /* continue */ }
      }

      // Site rep
      if (updated.registeredSiteId) {
        try {
          const siteRep = await this.prisma.siteRep.findFirst({
            where: { registeredSiteId: updated.registeredSiteId },
          });
          if (siteRep?.email) {
            recipients.push(siteRep.email);
          }
        } catch { /* continue */ }
      }

      // Registrants
      if (updated.registrations?.length) {
        for (const reg of updated.registrations) {
          if (reg.attendeeEmail) {
            recipients.push(reg.attendeeEmail);
          }
        }
      }

      // Deduplicate and send
      const uniqueRecipients = [...new Set(recipients)];
      for (const to of uniqueRecipients) {
        try {
          await emailService.sendCancellationNotification(to, eventDetails);
        } catch { /* continue even if one email fails */ }
      }
    }

    return updated;
  }
}
