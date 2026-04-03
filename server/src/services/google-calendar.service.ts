/**
 * GoogleCalendarService — adds confirmed events to the League's shared Google Calendar.
 * Degrades gracefully if credentials are not configured.
 */

import type { IGoogleCalendarClient } from './google-calendar.client';

export class GoogleCalendarService {
  constructor(
    private prisma: any,
    private calendarClient: IGoogleCalendarClient,
  ) {}

  /**
   * Create a calendar event for a confirmed request.
   * Returns the Google Calendar event ID, or null if not configured.
   */
  async createCalendarEvent(request: any): Promise<string | null> {
    const calendarId = process.env.GOOGLE_CALENDAR_ID;
    if (!calendarId) {
      console.warn('GoogleCalendarService: GOOGLE_CALENDAR_ID not configured, skipping calendar event');
      return null;
    }

    // Build description with request details
    const parts: string[] = [];
    if (request.requesterName) parts.push(`Requester: ${request.requesterName}`);
    if (request.expectedHeadcount) parts.push(`Expected headcount: ${request.expectedHeadcount}`);
    if (request.assignedInstructorName) parts.push(`Instructor: ${request.assignedInstructorName}`);
    const description = parts.join('\n');

    try {
      const result = await this.calendarClient.createEvent({
        calendarId,
        summary: request.classTitle || request.classSlug,
        date: request.confirmedDate || new Date(),
        location: request.locationFreeText,
        description,
      });
      return result.eventId;
    } catch (err) {
      console.error('GoogleCalendarService: failed to create calendar event', err);
      return null;
    }
  }
}
