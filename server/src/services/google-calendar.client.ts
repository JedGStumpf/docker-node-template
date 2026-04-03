/**
 * Google Calendar API client — interface + mock + real implementations.
 */

export interface CalendarEventParams {
  calendarId: string;
  summary: string;
  date: Date;
  location?: string;
  description?: string;
}

export interface IGoogleCalendarClient {
  createEvent(params: CalendarEventParams): Promise<{ eventId: string }>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
}

/**
 * Mock client for tests.
 */
export class MockGoogleCalendarClient implements IGoogleCalendarClient {
  calls: { method: string; args: any[] }[] = [];

  async createEvent(params: CalendarEventParams): Promise<{ eventId: string }> {
    this.calls.push({ method: 'createEvent', args: [params] });
    return { eventId: `mock-gcal-${Date.now()}` };
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    this.calls.push({ method: 'deleteEvent', args: [calendarId, eventId] });
  }
}

/**
 * Real Google Calendar API client using googleapis with service account.
 */
export class RealGoogleCalendarClient implements IGoogleCalendarClient {
  async createEvent(params: CalendarEventParams): Promise<{ eventId: string }> {
    const { google } = await import('googleapis');
    const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!keyJson) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not configured');
    }

    const key = JSON.parse(keyJson);
    const auth = new google.auth.GoogleAuth({
      credentials: key,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    const calendar = google.calendar({ version: 'v3', auth });

    // Create an all-day event
    const dateStr = params.date.toISOString().split('T')[0];
    const response = await calendar.events.insert({
      calendarId: params.calendarId,
      requestBody: {
        summary: params.summary,
        description: params.description,
        location: params.location,
        start: { date: dateStr },
        end: { date: dateStr },
      },
    });

    return { eventId: response.data.id! };
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    const { google } = await import('googleapis');
    const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!keyJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not configured');

    const key = JSON.parse(keyJson);
    const auth = new google.auth.GoogleAuth({
      credentials: key,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    const calendar = google.calendar({ version: 'v3', auth });
    await calendar.events.delete({ calendarId, eventId });
  }
}
