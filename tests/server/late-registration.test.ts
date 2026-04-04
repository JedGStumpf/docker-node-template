/**
 * Tests for late participant additions (ticket 010, sprint 005).
 *
 * A late registration on a confirmed event (confirmedDate already set)
 * must skip date-voting checks and register directly. Capacity / waitlist
 * logic still applies.
 */
process.env.NODE_ENV = 'test';

import { ServiceRegistry } from '../../server/src/services/service.registry';

const services = ServiceRegistry.create('UI');
const prisma = services.prisma;

async function createConfirmedRequest(overrides: Record<string, any> = {}) {
  return prisma.eventRequest.create({
    data: {
      classSlug: 'late-reg-test',
      requesterName: 'Late Reg Requester',
      requesterEmail: 'late-reg@example.com',
      groupType: 'school',
      expectedHeadcount: 20,
      zipCode: '12345',
      verificationToken: crypto.randomUUID(),
      verificationExpiresAt: new Date(Date.now() + 3_600_000),
      status: 'confirmed',
      confirmedDate: new Date('2026-07-15'),
      registrationToken: `late-reg-tok-${Date.now()}-${Math.random()}`,
      proposedDates: [],
      ...overrides,
    },
  });
}

beforeEach(async () => {
  await services.clearAll();
});

describe('Late registration on a confirmed event', () => {
  it('skips date-voting and registers directly (status: confirmed)', async () => {
    const req = await createConfirmedRequest();

    const reg = await services.registration.createRegistration(
      req.id,
      {
        attendeeName: 'Alice',
        attendeeEmail: 'alice-late@example.com',
        numberOfKids: 2,
        availableDates: [], // no date selection required for confirmed event
      },
      req.registrationToken,
    );

    expect(reg.status).toBe('confirmed');
  });

  it('does not require availableDates for a confirmed event', async () => {
    const req = await createConfirmedRequest();

    // availableDates is empty — this should not throw on a confirmed event
    const reg = await services.registration.createRegistration(
      req.id,
      {
        attendeeName: 'Bob',
        attendeeEmail: 'bob-late@example.com',
        numberOfKids: 1,
        availableDates: [],
      },
      req.registrationToken,
    );

    expect(reg).toBeTruthy();
    expect(reg.status).toBe('confirmed');
  });

  it('waitlists late registrant when event is at capacity', async () => {
    const req = await createConfirmedRequest({ eventCapacity: 1 });

    // Fill capacity
    await services.registration.createRegistration(
      req.id,
      {
        attendeeName: 'Alice',
        attendeeEmail: 'alice-late@example.com',
        numberOfKids: 1,
        availableDates: [],
      },
      req.registrationToken,
    );

    // This one should be waitlisted
    const reg2 = await services.registration.createRegistration(
      req.id,
      {
        attendeeName: 'Bob',
        attendeeEmail: 'bob-late@example.com',
        numberOfKids: 1,
        availableDates: [],
      },
      req.registrationToken,
    );

    expect(reg2.status).toBe('waitlisted');
  });

  it('allows unlimited late registrations when eventCapacity is null', async () => {
    const req = await createConfirmedRequest({ eventCapacity: null });

    const reg1 = await services.registration.createRegistration(
      req.id,
      { attendeeName: 'Alice', attendeeEmail: 'alice-late@example.com', numberOfKids: 1, availableDates: [] },
      req.registrationToken,
    );
    const reg2 = await services.registration.createRegistration(
      req.id,
      { attendeeName: 'Bob', attendeeEmail: 'bob-late@example.com', numberOfKids: 1, availableDates: [] },
      req.registrationToken,
    );

    expect(reg1.status).toBe('confirmed');
    expect(reg2.status).toBe('confirmed');
  });

  it('still rejects duplicate email on confirmed event', async () => {
    const req = await createConfirmedRequest();

    await services.registration.createRegistration(
      req.id,
      { attendeeName: 'Alice', attendeeEmail: 'alice-late@example.com', numberOfKids: 1, availableDates: [] },
      req.registrationToken,
    );

    await expect(
      services.registration.createRegistration(
        req.id,
        { attendeeName: 'Alice Again', attendeeEmail: 'alice-late@example.com', numberOfKids: 1, availableDates: [] },
        req.registrationToken,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('still rejects invalid registration token on confirmed event', async () => {
    const req = await createConfirmedRequest();

    await expect(
      services.registration.createRegistration(
        req.id,
        { attendeeName: 'Eve', attendeeEmail: 'eve-late@example.com', numberOfKids: 1, availableDates: [] },
        'wrong-token',
      ),
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});
