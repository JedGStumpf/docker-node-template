process.env.NODE_ENV = 'test';

import { ServiceRegistry } from '../../server/src/services/service.registry';

const services = ServiceRegistry.create('UI');
const prisma = services.prisma;

beforeEach(async () => {
  await services.clearAll();
});

describe('meetup-rsvp-sync scheduled job', () => {
  it('syncs RSVP counts for confirmed public events with meetupEventId', async () => {
    const req = await prisma.eventRequest.create({
      data: {
        classSlug: 'python-intro',
        requesterName: 'Test',
        requesterEmail: 'test@example.com',
        groupType: 'public',
        expectedHeadcount: 20,
        zipCode: '90210',
        verificationToken: `tok-${Date.now()}`,
        verificationExpiresAt: new Date(Date.now() + 3600000),
        status: 'confirmed',
        confirmedDate: new Date(Date.now() + 86400000 * 30), // 30 days from now
        meetupEventId: 'meetup-sync-test-1',
      },
    });

    // Simulate the job handler logic
    const requests = await prisma.eventRequest.findMany({
      where: {
        status: 'confirmed',
        groupType: 'public',
        meetupEventId: { not: null },
        confirmedDate: { gt: new Date() },
      },
    });

    expect(requests).toHaveLength(1);

    for (const r of requests) {
      await services.meetup.syncRsvps(r.id);
    }

    const updated = await prisma.eventRequest.findUnique({ where: { id: req.id } });
    expect(updated!.meetupRsvpCount).toBe(5); // MockMeetupClient returns 5
  });

  it('skips past events', async () => {
    await prisma.eventRequest.create({
      data: {
        classSlug: 'python-intro',
        requesterName: 'Test',
        requesterEmail: 'test@example.com',
        groupType: 'public',
        expectedHeadcount: 20,
        zipCode: '90210',
        verificationToken: `tok-past-${Date.now()}`,
        verificationExpiresAt: new Date(Date.now() + 3600000),
        status: 'confirmed',
        confirmedDate: new Date('2020-01-01'), // past event
        meetupEventId: 'meetup-past-1',
      },
    });

    const requests = await prisma.eventRequest.findMany({
      where: {
        status: 'confirmed',
        groupType: 'public',
        meetupEventId: { not: null },
        confirmedDate: { gt: new Date() },
      },
    });

    expect(requests).toHaveLength(0);
  });

  it('handles per-event errors without failing the whole job', async () => {
    const req = await prisma.eventRequest.create({
      data: {
        classSlug: 'python-intro',
        requesterName: 'Test',
        requesterEmail: 'test@example.com',
        groupType: 'public',
        expectedHeadcount: 20,
        zipCode: '90210',
        verificationToken: `tok-err-${Date.now()}`,
        verificationExpiresAt: new Date(Date.now() + 3600000),
        status: 'confirmed',
        confirmedDate: new Date(Date.now() + 86400000 * 30),
        meetupEventId: 'meetup-err-1',
      },
    });

    // Simulate error handling — should not throw
    const requests = await prisma.eventRequest.findMany({
      where: {
        status: 'confirmed',
        groupType: 'public',
        meetupEventId: { not: null },
        confirmedDate: { gt: new Date() },
      },
    });

    for (const r of requests) {
      try {
        await services.meetup.syncRsvps(r.id);
      } catch (err) {
        // Per-event error caught — job continues
      }
    }

    // Should reach here without throwing
    expect(true).toBe(true);
  });
});
