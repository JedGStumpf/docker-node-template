process.env.NODE_ENV = 'test';

import { ServiceRegistry } from '../../server/src/services/service.registry';
import { MockMeetupClient } from '../../server/src/services/meetup.client';
import { MockGoogleCalendarClient } from '../../server/src/services/google-calendar.client';
import { MockPike13Client } from '../../server/src/services/pike13.client';
import { flushQueue } from './helpers/flush-queue';

const services = ServiceRegistry.create('UI');
const prisma = services.prisma;

const meetupClient = services.meetupClient as MockMeetupClient;
const googleCalClient = services.googleCalendarClient as MockGoogleCalendarClient;
const pike13Client = services.pike13Client as MockPike13Client;

// Helper: create a request in dates_proposed state ready for confirmation
async function createDatesProposedRequest(overrides: Record<string, any> = {}) {
  const req = await prisma.eventRequest.create({
    data: {
      classSlug: 'python-intro',
      requesterName: 'Test User',
      requesterEmail: 'test@example.com',
      groupType: 'public',
      expectedHeadcount: 20,
      zipCode: '90210',
      verificationToken: `tok-${Date.now()}-${Math.random()}`,
      verificationExpiresAt: new Date(Date.now() + 3600000),
      status: 'dates_proposed',
      proposedDates: ['2026-05-01', '2026-05-08'],
      registrationToken: `regtoken-${Date.now()}`,
      minHeadcount: 5,
      votingDeadline: new Date(Date.now() + 86400000 * 7),
      ...overrides,
    },
  });
  return req;
}

beforeEach(async () => {
  await services.clearAll();
  meetupClient.calls = [];
  googleCalClient.calls = [];
  if ('bookInstructorCalls' in pike13Client) {
    pike13Client.bookInstructorCalls = [];
  }
});

describe('Confirmed transition side effects', () => {
  it('creates Meetup event for public events', async () => {
    process.env.MEETUP_GROUP_URLNAME = 'test-group';
    const req = await createDatesProposedRequest({ groupType: 'public' });

    await services.requests.transitionStatus(req.id, 'confirmed', {
      confirmedDate: '2026-05-01',
    });

    expect(meetupClient.calls.some(c => c.method === 'createEvent')).toBe(true);

    // Verify meetupEventId was stored
    const updated = await prisma.eventRequest.findUnique({ where: { id: req.id } });
    expect(updated.meetupEventId).toBeTruthy();
    expect(updated.meetupEventUrl).toBeTruthy();

    delete process.env.MEETUP_GROUP_URLNAME;
  });

  it('skips Meetup event for private events', async () => {
    process.env.MEETUP_GROUP_URLNAME = 'test-group';
    const req = await createDatesProposedRequest({ groupType: 'school' });

    await services.requests.transitionStatus(req.id, 'confirmed', {
      confirmedDate: '2026-05-01',
    });

    expect(meetupClient.calls.filter(c => c.method === 'createEvent')).toHaveLength(0);

    delete process.env.MEETUP_GROUP_URLNAME;
  });

  it('creates Google Calendar event for all events', async () => {
    process.env.GOOGLE_CALENDAR_ID = 'test-cal-id';
    const req = await createDatesProposedRequest({ groupType: 'school' });

    await services.requests.transitionStatus(req.id, 'confirmed', {
      confirmedDate: '2026-05-01',
    });

    expect(googleCalClient.calls.some(c => c.method === 'createEvent')).toBe(true);

    const updated = await prisma.eventRequest.findUnique({ where: { id: req.id } });
    expect(updated.googleCalendarEventId).toBeTruthy();

    delete process.env.GOOGLE_CALENDAR_ID;
  });

  it('books Pike13 instructor when assigned', async () => {
    const instructor = await prisma.instructorProfile.create({
      data: {
        displayName: 'Test Instructor',
        email: 'instructor@test.com',
        pike13UserId: 'pike-123',
        topics: '["python"]',
        serviceZips: '["90210"]',
        homeZip: '90210',
      },
    });

    const req = await createDatesProposedRequest({
      assignedInstructorId: instructor.id,
    });

    await services.requests.transitionStatus(req.id, 'confirmed', {
      confirmedDate: '2026-05-01',
    });

    expect(pike13Client.bookInstructorCalls).toHaveLength(1);
    expect(pike13Client.bookInstructorCalls[0].pike13UserId).toBe('pike-123');
  });

  it('does not fail confirmation when side effects error', async () => {
    // Set up a scenario where Meetup will be called but no group is configured
    delete process.env.MEETUP_GROUP_URLNAME;
    delete process.env.GOOGLE_CALENDAR_ID;

    const req = await createDatesProposedRequest({ groupType: 'public' });

    // This should succeed even though side effects have no config
    const updated = await services.requests.transitionStatus(req.id, 'confirmed', {
      confirmedDate: '2026-05-01',
    });

    expect(updated.status).toBe('confirmed');
  });
});
