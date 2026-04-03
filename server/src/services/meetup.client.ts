/**
 * Meetup API client — interface + mock + real implementations.
 * Follows the established Pike13 client pattern.
 */

export interface MeetupEventParams {
  title: string;
  description: string;
  date: Date;
  location?: string;
  groupUrlname: string;
}

export interface IMeetupClient {
  createEvent(params: MeetupEventParams): Promise<{ eventId: string; eventUrl: string }>;
  getRsvps(eventId: string): Promise<{ count: number }>;
  updateEvent(eventId: string, params: Partial<MeetupEventParams>): Promise<void>;
}

/**
 * Mock client for tests — returns fake IDs.
 */
export class MockMeetupClient implements IMeetupClient {
  calls: { method: string; args: any[] }[] = [];

  async createEvent(params: MeetupEventParams): Promise<{ eventId: string; eventUrl: string }> {
    this.calls.push({ method: 'createEvent', args: [params] });
    return { eventId: `mock-meetup-${Date.now()}`, eventUrl: `https://meetup.com/mock-event-${Date.now()}` };
  }

  async getRsvps(eventId: string): Promise<{ count: number }> {
    this.calls.push({ method: 'getRsvps', args: [eventId] });
    return { count: 5 };
  }

  async updateEvent(eventId: string, params: Partial<MeetupEventParams>): Promise<void> {
    this.calls.push({ method: 'updateEvent', args: [eventId, params] });
  }
}

/**
 * Real Meetup API client using Meetup GraphQL API.
 * Degrades gracefully if MEETUP_API_KEY is missing.
 */
export class RealMeetupClient implements IMeetupClient {
  private apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.MEETUP_API_KEY;
  }

  private assertConfigured(): void {
    if (!this.apiKey) {
      const err: any = new Error(
        'Meetup integration is not configured. Set MEETUP_API_KEY environment variable. ' +
        'See docs/api-integrations.md for setup instructions.'
      );
      err.statusCode = 501;
      throw err;
    }
  }

  async createEvent(params: MeetupEventParams): Promise<{ eventId: string; eventUrl: string }> {
    this.assertConfigured();
    const query = `
      mutation CreateEvent($input: CreateEventInput!) {
        createEvent(input: $input) {
          event { id eventUrl }
        }
      }
    `;
    const variables = {
      input: {
        groupUrlname: params.groupUrlname,
        title: params.title,
        description: params.description,
        startDateTime: params.date.toISOString(),
        eventType: 'PHYSICAL',
        venue: params.location ? { name: params.location } : undefined,
      },
    };
    const resp = await fetch('https://api.meetup.com/gql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!resp.ok) {
      throw new Error(`Meetup API error: ${resp.status} ${resp.statusText}`);
    }
    const data: any = await resp.json();
    if (data.errors?.length) {
      throw new Error(`Meetup GraphQL error: ${data.errors[0].message}`);
    }
    const event = data.data.createEvent.event;
    return { eventId: event.id, eventUrl: event.eventUrl };
  }

  async getRsvps(eventId: string): Promise<{ count: number }> {
    this.assertConfigured();
    const query = `
      query GetRsvps($eventId: ID!) {
        event(id: $eventId) {
          rsvps { count }
        }
      }
    `;
    const resp = await fetch('https://api.meetup.com/gql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ query, variables: { eventId } }),
    });
    if (!resp.ok) {
      throw new Error(`Meetup API error: ${resp.status}`);
    }
    const data: any = await resp.json();
    return { count: data.data?.event?.rsvps?.count || 0 };
  }

  async updateEvent(eventId: string, params: Partial<MeetupEventParams>): Promise<void> {
    this.assertConfigured();
    // Implementation would call Meetup mutation — not needed for Sprint 004 MVP
    console.warn('RealMeetupClient.updateEvent: not fully implemented');
  }
}
