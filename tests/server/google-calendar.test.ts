process.env.NODE_ENV = 'test';

import { ServiceRegistry } from '../../server/src/services/service.registry';
import { MockGoogleCalendarClient } from '../../server/src/services/google-calendar.client';
import { GoogleCalendarService } from '../../server/src/services/google-calendar.service';

const services = ServiceRegistry.create('UI');
const prisma = services.prisma;

const mockCalClient = new MockGoogleCalendarClient();
const calService = new GoogleCalendarService(prisma, mockCalClient);

beforeEach(async () => {
  await services.clearAll();
  mockCalClient.calls = [];
});

describe('GoogleCalendarService', () => {
  it('creates a calendar event with correct fields', async () => {
    process.env.GOOGLE_CALENDAR_ID = 'test-cal-id';

    const result = await calService.createCalendarEvent({
      classSlug: 'python-intro',
      classTitle: 'Introduction to Python',
      requesterName: 'Test User',
      expectedHeadcount: 20,
      confirmedDate: new Date('2026-05-01'),
      locationFreeText: 'Community Center',
      assignedInstructorName: 'Jane Doe',
    });

    expect(result).toBeTruthy();
    expect(mockCalClient.calls).toHaveLength(1);
    
    const call = mockCalClient.calls[0];
    expect(call.args[0].calendarId).toBe('test-cal-id');
    expect(call.args[0].summary).toBe('Introduction to Python');
    expect(call.args[0].location).toBe('Community Center');
    expect(call.args[0].description).toContain('Test User');
    expect(call.args[0].description).toContain('Jane Doe');

    delete process.env.GOOGLE_CALENDAR_ID;
  });

  it('returns null when GOOGLE_CALENDAR_ID is not set', async () => {
    delete process.env.GOOGLE_CALENDAR_ID;

    const result = await calService.createCalendarEvent({
      classSlug: 'python-intro',
      requesterName: 'Test User',
    });

    expect(result).toBeNull();
    expect(mockCalClient.calls).toHaveLength(0);
  });

  it('returns null (not error) when calendar client throws', async () => {
    process.env.GOOGLE_CALENDAR_ID = 'test-cal-id';

    const failClient = new MockGoogleCalendarClient();
    failClient.createEvent = async () => { throw new Error('API error'); };
    const failService = new GoogleCalendarService(prisma, failClient);

    const result = await failService.createCalendarEvent({
      classSlug: 'python-intro',
      requesterName: 'Test User',
    });

    expect(result).toBeNull();

    delete process.env.GOOGLE_CALENDAR_ID;
  });

  it('falls back to classSlug when classTitle is missing', async () => {
    process.env.GOOGLE_CALENDAR_ID = 'test-cal-id';

    await calService.createCalendarEvent({
      classSlug: 'python-intro',
      requesterName: 'Test User',
    });

    const call = mockCalClient.calls[0];
    expect(call.args[0].summary).toBe('python-intro');

    delete process.env.GOOGLE_CALENDAR_ID;
  });
});
