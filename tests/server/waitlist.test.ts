process.env.NODE_ENV = 'test';

import request from 'supertest';
import app from '../../server/src/app';
import { ServiceRegistry } from '../../server/src/services/service.registry';
import { InMemoryEmailTransport } from '../../server/src/services/email.service';
import { flushQueue } from './helpers/flush-queue';

const services = ServiceRegistry.create('UI');
const prisma = services.prisma;

async function createConfirmedRequest(capacity: number | null = 2) {
  return prisma.eventRequest.create({
    data: {
      classSlug: 'python-intro',
      requesterName: 'Test User',
      requesterEmail: 'test@example.com',
      groupType: 'public',
      expectedHeadcount: 20,
      zipCode: '90210',
      verificationToken: `tok-${Date.now()}-${Math.random()}`,
      verificationExpiresAt: new Date(Date.now() + 3600000),
      status: 'confirmed',
      confirmedDate: new Date('2026-05-01'),
      registrationToken: `regtoken-${Date.now()}-${Math.random()}`,
      eventCapacity: capacity,
    },
  });
}

beforeEach(async () => {
  await services.clearAll();
  const transport = services.email.getTransport();
  if (transport instanceof InMemoryEmailTransport) {
    transport.reset();
  }
});

describe('Registration Waitlist', () => {
  it('creates a confirmed registration when under capacity', async () => {
    const req = await createConfirmedRequest(5);

    const reg = await services.registration.createRegistration(
      req.id,
      { attendeeName: 'Alice', attendeeEmail: 'alice@example.com', numberOfKids: 2, availableDates: [] },
      req.registrationToken,
    );

    expect(reg.status).toBe('confirmed');
  });

  it('creates a waitlisted registration when at capacity', async () => {
    const req = await createConfirmedRequest(1);

    // Fill to capacity
    await services.registration.createRegistration(
      req.id,
      { attendeeName: 'Alice', attendeeEmail: 'alice@example.com', numberOfKids: 1, availableDates: [] },
      req.registrationToken,
    );

    // This one should be waitlisted
    const reg2 = await services.registration.createRegistration(
      req.id,
      { attendeeName: 'Bob', attendeeEmail: 'bob@example.com', numberOfKids: 1, availableDates: [] },
      req.registrationToken,
    );

    expect(reg2.status).toBe('waitlisted');
  });

  it('allows unlimited registrations when eventCapacity is null', async () => {
    const req = await createConfirmedRequest(null);

    const reg1 = await services.registration.createRegistration(
      req.id,
      { attendeeName: 'Alice', attendeeEmail: 'alice@example.com', numberOfKids: 1, availableDates: [] },
      req.registrationToken,
    );
    const reg2 = await services.registration.createRegistration(
      req.id,
      { attendeeName: 'Bob', attendeeEmail: 'bob@example.com', numberOfKids: 1, availableDates: [] },
      req.registrationToken,
    );

    expect(reg1.status).toBe('confirmed');
    expect(reg2.status).toBe('confirmed');
  });

  it('promotes oldest waitlisted on cancellation', async () => {
    const req = await createConfirmedRequest(1);

    const reg1 = await services.registration.createRegistration(
      req.id,
      { attendeeName: 'Alice', attendeeEmail: 'alice@example.com', numberOfKids: 1, availableDates: [] },
      req.registrationToken,
    );
    const reg2 = await services.registration.createRegistration(
      req.id,
      { attendeeName: 'Bob', attendeeEmail: 'bob@example.com', numberOfKids: 1, availableDates: [] },
      req.registrationToken,
    );

    expect(reg2.status).toBe('waitlisted');

    // Cancel the confirmed registration
    await services.registration.cancelRegistration(reg1.id, services.email);

    // Bob should now be promoted
    const bobUpdated = await prisma.registration.findUnique({ where: { id: reg2.id } });
    expect(bobUpdated!.status).toBe('confirmed');
  });

  it('sends iCal email to promoted registrant', async () => {
    const req = await createConfirmedRequest(1);

    const reg1 = await services.registration.createRegistration(
      req.id,
      { attendeeName: 'Alice', attendeeEmail: 'alice@example.com', numberOfKids: 1, availableDates: [] },
      req.registrationToken,
    );
    await services.registration.createRegistration(
      req.id,
      { attendeeName: 'Bob', attendeeEmail: 'bob@example.com', numberOfKids: 1, availableDates: [] },
      req.registrationToken,
    );

    await services.registration.cancelRegistration(reg1.id, services.email);
    await flushQueue(services);

    const transport = services.email.getTransport() as InMemoryEmailTransport;
    const bobEmail = transport.sent.find(m => m.to === 'bob@example.com');
    expect(bobEmail).toBeTruthy();
    expect(bobEmail!.subject).toContain('Confirmed');
  });

  it('does not promote when waitlist is empty', async () => {
    const req = await createConfirmedRequest(2);

    const reg1 = await services.registration.createRegistration(
      req.id,
      { attendeeName: 'Alice', attendeeEmail: 'alice@example.com', numberOfKids: 1, availableDates: [] },
      req.registrationToken,
    );

    // Cancel — no waitlisted registrations to promote
    await services.registration.cancelRegistration(reg1.id, services.email);

    const regs = await prisma.registration.findMany({ where: { requestId: req.id } });
    expect(regs.filter((r: any) => r.status === 'confirmed')).toHaveLength(0);
  });

  it('cancel route works with valid token', async () => {
    const req = await createConfirmedRequest(5);

    const reg = await services.registration.createRegistration(
      req.id,
      { attendeeName: 'Alice', attendeeEmail: 'alice@example.com', numberOfKids: 1, availableDates: [] },
      req.registrationToken,
    );

    const res = await request(app)
      .post(`/api/events/${req.id}/registrations/${reg.id}/cancel`)
      .send({ token: req.registrationToken })
      .expect(200);

    expect(res.body.status).toBe('cancelled');
  });
});
