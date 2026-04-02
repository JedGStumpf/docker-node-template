/**
 * RegistrationService — manages Registration model, date vote tallies,
 * headcount threshold checks, and date finalization (auto + manual).
 * Ticket 004, Sprint 003.
 */

import { ServiceError } from '../errors';
import { isSqlite } from './prisma';

export class RegistrationService {
  constructor(private prisma: any) {}

  /**
   * Create a registration for a private event.
   * Validates token, request status, availableDates subset, and unique email.
   * After creation, checks if any date has reached the threshold.
   */
  async createRegistration(
    requestId: string,
    data: {
      attendeeName: string;
      attendeeEmail: string;
      numberOfKids: number;
      availableDates: string[];
    },
    token: string,
  ) {
    const request = await this.prisma.eventRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) {
      throw new ServiceError('Request not found', 404);
    }
    if (!request.registrationToken || request.registrationToken !== token) {
      throw new ServiceError('Invalid or missing registration token', 401);
    }
    if (request.status !== 'dates_proposed') {
      throw new ServiceError('Registration is not currently open for this event', 422);
    }

    // Validate availableDates is a non-empty subset of proposedDates
    if (!data.availableDates || data.availableDates.length === 0) {
      throw new ServiceError('availableDates must be a non-empty array', 422);
    }
    const proposedSet = new Set(
      (Array.isArray(request.proposedDates) ? request.proposedDates : []).map(String),
    );
    for (const d of data.availableDates) {
      if (!proposedSet.has(String(d))) {
        throw new ServiceError(
          `Date ${d} is not one of the proposed dates`,
          422,
        );
      }
    }

    // Check for duplicate email
    const existing = await this.prisma.registration.findUnique({
      where: {
        requestId_attendeeEmail: {
          requestId,
          attendeeEmail: data.attendeeEmail,
        },
      },
    });
    if (existing) {
      throw new ServiceError("You've already registered for this event", 409);
    }

    const registration = await this.prisma.registration.create({
      data: {
        requestId,
        attendeeName: data.attendeeName,
        attendeeEmail: data.attendeeEmail,
        numberOfKids: data.numberOfKids,
        availableDates: data.availableDates,
        status: 'interested',
      },
    });

    // Check threshold after creation
    await this.checkAndFinalizeThreshold(requestId);

    return registration;
  }

  /**
   * Get public event info with vote tallies per date.
   */
  async getEventInfo(requestId: string, token: string) {
    const request = await this.prisma.eventRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) {
      throw new ServiceError('Request not found', 404);
    }
    if (!request.registrationToken || request.registrationToken !== token) {
      throw new ServiceError('Invalid or missing registration token', 401);
    }

    const registrations = await this.prisma.registration.findMany({
      where: { requestId },
    });

    const proposedDates: string[] = Array.isArray(request.proposedDates)
      ? request.proposedDates
      : [];

    // Compute vote tallies: sum of numberOfKids per date
    const tallies: Record<string, number> = {};
    for (const d of proposedDates) {
      tallies[d] = 0;
    }
    for (const reg of registrations) {
      const dates: string[] = Array.isArray(reg.availableDates) ? reg.availableDates : [];
      for (const d of dates) {
        if (d in tallies) {
          tallies[d] += reg.numberOfKids;
        }
      }
    }

    return {
      id: request.id,
      classSlug: request.classSlug,
      status: request.status,
      proposedDates,
      confirmedDate: request.confirmedDate,
      locationFreeText: request.locationFreeText,
      eventType: request.eventType,
      minHeadcount: request.minHeadcount,
      votingDeadline: request.votingDeadline,
      voteTallies: tallies,
      registrationCount: registrations.length,
    };
  }

  /**
   * List all registrations for an event (admin/instructor).
   */
  async listRegistrations(requestId: string) {
    const registrations = await this.prisma.registration.findMany({
      where: { requestId },
      orderBy: { createdAt: 'asc' },
    });

    const request = await this.prisma.eventRequest.findUnique({
      where: { id: requestId },
    });
    const proposedDates: string[] = request && Array.isArray(request.proposedDates)
      ? request.proposedDates
      : [];

    // Aggregate vote tallies
    const tallies: Record<string, number> = {};
    for (const d of proposedDates) {
      tallies[d] = 0;
    }
    for (const reg of registrations) {
      const dates: string[] = Array.isArray(reg.availableDates) ? reg.availableDates : [];
      for (const d of dates) {
        if (d in tallies) {
          tallies[d] += reg.numberOfKids;
        }
      }
    }

    return { registrations, voteTallies: tallies };
  }

  /**
   * Check if any proposed date has reached the minimum headcount threshold.
   * If so, finalize that date. Tie-breaking: highest kid count, then earliest date.
   */
  async checkAndFinalizeThreshold(requestId: string) {
    const request = await this.prisma.eventRequest.findUnique({
      where: { id: requestId },
    });
    if (!request || request.status !== 'dates_proposed') {
      return null;
    }
    if (!request.minHeadcount) {
      return null;
    }

    const registrations = await this.prisma.registration.findMany({
      where: { requestId },
    });

    const proposedDates: string[] = Array.isArray(request.proposedDates)
      ? request.proposedDates
      : [];

    // Compute kid count per date
    const dateCounts: Record<string, number> = {};
    for (const d of proposedDates) {
      dateCounts[d] = 0;
    }
    for (const reg of registrations) {
      const dates: string[] = Array.isArray(reg.availableDates) ? reg.availableDates : [];
      for (const d of dates) {
        if (d in dateCounts) {
          dateCounts[d] += reg.numberOfKids;
        }
      }
    }

    // Find dates that meet the threshold
    const qualifyingDates = proposedDates.filter(d => dateCounts[d] >= request.minHeadcount);
    if (qualifyingDates.length === 0) {
      return null;
    }

    // Tie-breaking: highest kid count, then earliest date
    qualifyingDates.sort((a, b) => {
      const countDiff = dateCounts[b] - dateCounts[a];
      if (countDiff !== 0) return countDiff;
      return new Date(a).getTime() - new Date(b).getTime();
    });

    const winningDate = qualifyingDates[0];
    return this.finalizeDate(requestId, winningDate);
  }

  /**
   * Finalize a date for the event. Updates request status to confirmed,
   * updates registrant statuses, and returns the updated data.
   * Idempotent — returns early if already confirmed.
   */
  async finalizeDate(requestId: string, date: string, requestService?: any, emailService?: any) {
    const request = await this.prisma.eventRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) {
      throw new ServiceError('Request not found', 404);
    }

    // Idempotent: already confirmed
    if (request.status === 'confirmed') {
      return request;
    }

    if (request.status !== 'dates_proposed') {
      throw new ServiceError('Request must be in dates_proposed status to finalize', 422);
    }

    const confirmedDate = new Date(date);

    // Update request: set confirmedDate and transition to confirmed
    if (requestService) {
      await requestService.transitionStatus(requestId, 'confirmed', {
        confirmedDate: date,
      });
    } else {
      await this.prisma.eventRequest.update({
        where: { id: requestId },
        data: {
          status: 'confirmed',
          confirmedDate,
        },
      });
    }

    // Update registrant statuses
    const registrations = await this.prisma.registration.findMany({
      where: { requestId },
    });

    const dateStr = String(date);
    for (const reg of registrations) {
      const regDates: string[] = Array.isArray(reg.availableDates)
        ? reg.availableDates
        : [];
      const votedForWinner = regDates.includes(dateStr);
      await this.prisma.registration.update({
        where: { id: reg.id },
        data: {
          status: votedForWinner ? 'confirmed' : 'declined',
        },
      });
    }

    // Post-commit side effects: send emails
    if (emailService) {
      const updatedRequest = await this.prisma.eventRequest.findUnique({
        where: { id: requestId },
      });
      const eventDetails = {
        title: updatedRequest?.classSlug || request.classSlug,
        date: confirmedDate,
        location: updatedRequest?.locationFreeText || request.locationFreeText,
        organizerEmail: process.env.ADMIN_EMAIL || 'admin@jointheleague.org',
        replyTo: updatedRequest?.emailThreadAddress || request.emailThreadAddress,
      };

      for (const reg of registrations) {
        const regDates: string[] = Array.isArray(reg.availableDates)
          ? reg.availableDates
          : [];
        const votedForWinner = regDates.includes(dateStr);
        try {
          if (votedForWinner) {
            await emailService.sendEventConfirmation(reg.attendeeEmail, eventDetails);
          } else {
            await emailService.sendDateChangeNotification(
              reg.attendeeEmail,
              { title: eventDetails.title, location: eventDetails.location, replyTo: eventDetails.replyTo },
              confirmedDate,
            );
          }
        } catch { /* continue */ }
      }
    }

    return this.prisma.eventRequest.findUnique({ where: { id: requestId } });
  }

  /**
   * Generate an HTML digest summarizing registrations for an event.
   */
  generateDigest(
    registrations: Array<{
      attendeeName: string;
      numberOfKids: number;
      availableDates: string[];
    }>,
    proposedDates: string[],
  ): string {
    const tallies: Record<string, number> = {};
    let totalKids = 0;
    for (const d of proposedDates) {
      tallies[d] = 0;
    }
    for (const reg of registrations) {
      totalKids += reg.numberOfKids;
      const dates: string[] = Array.isArray(reg.availableDates) ? reg.availableDates : [];
      for (const d of dates) {
        if (d in tallies) {
          tallies[d] += reg.numberOfKids;
        }
      }
    }

    let html = '<h2>Registration Summary</h2>';
    html += `<p>Total registrations: ${registrations.length} (${totalKids} kids)</p>`;
    html += '<table border="1" cellpadding="4"><tr><th>Date</th><th>Kids</th></tr>';
    for (const d of proposedDates) {
      html += `<tr><td>${d}</td><td>${tallies[d]}</td></tr>`;
    }
    html += '</table>';
    html += '<h3>Registrants</h3><ul>';
    for (const reg of registrations) {
      html += `<li>${reg.attendeeName} — ${reg.numberOfKids} kid(s)</li>`;
    }
    html += '</ul>';
    return html;
  }
}
