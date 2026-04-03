import request from 'supertest';

process.env.NODE_ENV = 'test';

import { ServiceRegistry } from '../../server/src/services/service.registry';
import { MockMeetupClient } from '../../server/src/services/meetup.client';
import { MeetupService } from '../../server/src/services/meetup.service';
import { ContentService } from '../../server/src/services/content.service';
import path from 'path';

const services = ServiceRegistry.create('UI');
const prisma = services.prisma;

// Create a MeetupService with mock client and content from fixture
const fixtureUrl = `file://${path.resolve(__dirname, '../fixtures/content.json')}`;
const contentService = new ContentService(fixtureUrl, 0);
const mockMeetupClient = new MockMeetupClient();
const meetupService = new MeetupService(prisma, mockMeetupClient, contentService);

beforeEach(async () => {
  await services.clearAll();
  mockMeetupClient.calls = [];
  contentService.invalidateCache();
});

describe('MeetupService', () => {
  describe('createMeetupEvent()', () => {
    it('creates a Meetup event with class details', async () => {
      process.env.MEETUP_GROUP_URLNAME = 'test-group';
      
      const request = {
        id: 'req-1',
        classSlug: 'python-intro',
        requesterName: 'Test User',
        locationFreeText: 'Community Center',
        confirmedDate: new Date('2026-05-01'),
      };

      const result = await meetupService.createMeetupEvent(request);

      expect(result).not.toBeNull();
      expect(result!.meetupEventId).toBeTruthy();
      expect(result!.meetupEventUrl).toBeTruthy();

      // Verify mock was called with correct params
      expect(mockMeetupClient.calls).toHaveLength(1);
      const call = mockMeetupClient.calls[0];
      expect(call.method).toBe('createEvent');
      expect(call.args[0].groupUrlname).toBe('test-group');
      
      delete process.env.MEETUP_GROUP_URLNAME;
    });

    it('returns null when MEETUP_GROUP_URLNAME is not set', async () => {
      delete process.env.MEETUP_GROUP_URLNAME;

      const result = await meetupService.createMeetupEvent({
        id: 'req-3',
        classSlug: 'python-intro',
        requesterName: 'Test User',
      });

      expect(result).toBeNull();
      expect(mockMeetupClient.calls).toHaveLength(0);
    });
  });

  describe('syncRsvps()', () => {
    it('updates meetupRsvpCount on EventRequest', async () => {
      // Create a request with a meetup event ID
      const req = await prisma.eventRequest.create({
        data: {
          classSlug: 'python-intro',
          requesterName: 'Test',
          requesterEmail: 'test@example.com',
          groupType: 'school',
          expectedHeadcount: 20,
          zipCode: '90210',
          verificationToken: 'tok1',
          verificationExpiresAt: new Date(Date.now() + 3600000),
          status: 'confirmed',
          meetupEventId: 'meetup-123',
        },
      });

      await meetupService.syncRsvps(req.id);

      const updated = await prisma.eventRequest.findUnique({ where: { id: req.id } });
      expect(updated.meetupRsvpCount).toBe(5); // MockMeetupClient returns 5
    });

    it('does nothing when meetupEventId is not set', async () => {
      const req = await prisma.eventRequest.create({
        data: {
          classSlug: 'python-intro',
          requesterName: 'Test',
          requesterEmail: 'test@example.com',
          groupType: 'school',
          expectedHeadcount: 20,
          zipCode: '90210',
          verificationToken: 'tok2',
          verificationExpiresAt: new Date(Date.now() + 3600000),
          status: 'confirmed',
        },
      });

      await meetupService.syncRsvps(req.id);
      expect(mockMeetupClient.calls).toHaveLength(0);
    });
  });
});
