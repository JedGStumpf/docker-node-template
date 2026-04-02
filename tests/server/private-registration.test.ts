/**
 * Tests for RegistrationService — registration, token validation,
 * duplicate handling, and event info.
 * Ticket 004, Sprint 003.
 */
import { prisma } from '../../server/src/services/prisma';
import { RegistrationService } from '../../server/src/services/registration.service';

process.env.NODE_ENV = 'test';

const TEST_EMAIL = 'reg-test@example.com';
const REG_TOKEN = 'a'.repeat(64);

let service: RegistrationService;

beforeAll(() => {
  service = new RegistrationService(prisma);
});

async function seedRequest(status: string = 'dates_proposed', extra: Record<string, any> = {}) {
  return prisma.eventRequest.create({
    data: {
      classSlug: 'coding-101',
      requesterName: 'Reg Tester',
      requesterEmail: TEST_EMAIL,
      groupType: 'community',
      expectedHeadcount: 10,
      zipCode: '98101',
      preferredDates: ['2026-06-01'],
      verificationToken: crypto.randomUUID(),
      verificationExpiresAt: new Date(Date.now() + 3600_000),
      status,
      registrationToken: REG_TOKEN,
      proposedDates: ['2026-06-15', '2026-06-22'],
      minHeadcount: 5,
      ...extra,
    },
  });
}

afterEach(async () => {
  await prisma.registration.deleteMany({
    where: { request: { requesterEmail: TEST_EMAIL } },
  }).catch(() => {});
  await prisma.instructorAssignment.deleteMany({
    where: { request: { requesterEmail: TEST_EMAIL } },
  }).catch(() => {});
  await prisma.eventRequest.deleteMany({
    where: { requesterEmail: TEST_EMAIL },
  }).catch(() => {});
});

describe('RegistrationService', () => {
  describe('createRegistration', () => {
    it('creates a registration with valid token and data', async () => {
      const req = await seedRequest();
      const reg = await service.createRegistration(
        req.id,
        {
          attendeeName: 'Alice',
          attendeeEmail: 'alice@example.com',
          numberOfKids: 3,
          availableDates: ['2026-06-15'],
        },
        REG_TOKEN,
      );

      expect(reg.attendeeName).toBe('Alice');
      expect(reg.attendeeEmail).toBe('alice@example.com');
      expect(reg.numberOfKids).toBe(3);
      expect(reg.status).toBe('interested');
    });

    it('returns 401 with invalid token', async () => {
      const req = await seedRequest();
      await expect(
        service.createRegistration(req.id, {
          attendeeName: 'Bob',
          attendeeEmail: 'bob@example.com',
          numberOfKids: 1,
          availableDates: ['2026-06-15'],
        }, 'wrong-token'),
      ).rejects.toThrow(/Invalid or missing registration token/);
    });

    it('returns 422 when request is not in dates_proposed status', async () => {
      const req = await seedRequest('discussing');
      await expect(
        service.createRegistration(req.id, {
          attendeeName: 'Carol',
          attendeeEmail: 'carol@example.com',
          numberOfKids: 2,
          availableDates: ['2026-06-15'],
        }, REG_TOKEN),
      ).rejects.toThrow(/Registration is not currently open/);
    });

    it('returns 409 on duplicate email', async () => {
      const req = await seedRequest();
      await service.createRegistration(
        req.id,
        {
          attendeeName: 'Dave',
          attendeeEmail: 'dave@example.com',
          numberOfKids: 1,
          availableDates: ['2026-06-15'],
        },
        REG_TOKEN,
      );
      await expect(
        service.createRegistration(req.id, {
          attendeeName: 'Dave Again',
          attendeeEmail: 'dave@example.com',
          numberOfKids: 2,
          availableDates: ['2026-06-22'],
        }, REG_TOKEN),
      ).rejects.toThrow(/already registered/);
    });

    it('returns 422 when availableDates is not a subset of proposedDates', async () => {
      const req = await seedRequest();
      await expect(
        service.createRegistration(req.id, {
          attendeeName: 'Eve',
          attendeeEmail: 'eve@example.com',
          numberOfKids: 1,
          availableDates: ['2026-07-01'],
        }, REG_TOKEN),
      ).rejects.toThrow(/not one of the proposed dates/);
    });
  });

  describe('getEventInfo', () => {
    it('returns event info with vote tallies', async () => {
      const req = await seedRequest();
      await prisma.registration.create({
        data: {
          requestId: req.id,
          attendeeName: 'Frank',
          attendeeEmail: 'frank@example.com',
          numberOfKids: 3,
          availableDates: ['2026-06-15'],
        },
      });
      await prisma.registration.create({
        data: {
          requestId: req.id,
          attendeeName: 'Grace',
          attendeeEmail: 'grace@example.com',
          numberOfKids: 2,
          availableDates: ['2026-06-15', '2026-06-22'],
        },
      });

      const info = await service.getEventInfo(req.id, REG_TOKEN);
      expect(info.classSlug).toBe('coding-101');
      expect(info.proposedDates).toHaveLength(2);
      expect(info.voteTallies['2026-06-15']).toBe(5);
      expect(info.voteTallies['2026-06-22']).toBe(2);
      expect(info.registrationCount).toBe(2);
    });

    it('returns 401 with invalid token', async () => {
      const req = await seedRequest();
      await expect(
        service.getEventInfo(req.id, 'bad-token'),
      ).rejects.toThrow(/Invalid or missing registration token/);
    });
  });

  describe('listRegistrations', () => {
    it('returns all registrations with vote tallies', async () => {
      const req = await seedRequest();
      await prisma.registration.create({
        data: {
          requestId: req.id,
          attendeeName: 'Hank',
          attendeeEmail: 'hank@example.com',
          numberOfKids: 4,
          availableDates: ['2026-06-15'],
        },
      });
      await prisma.registration.create({
        data: {
          requestId: req.id,
          attendeeName: 'Iris',
          attendeeEmail: 'iris@example.com',
          numberOfKids: 1,
          availableDates: ['2026-06-22'],
        },
      });

      const result = await service.listRegistrations(req.id);
      expect(result.registrations).toHaveLength(2);
      expect(result.voteTallies['2026-06-15']).toBe(4);
      expect(result.voteTallies['2026-06-22']).toBe(1);
    });
  });

  describe('generateDigest', () => {
    it('produces correct HTML with per-date tallies', () => {
      const html = service.generateDigest(
        [
          { attendeeName: 'Alice', numberOfKids: 3, availableDates: ['2026-06-15'] },
          { attendeeName: 'Bob', numberOfKids: 2, availableDates: ['2026-06-15', '2026-06-22'] },
        ],
        ['2026-06-15', '2026-06-22'],
      );

      expect(html).toContain('Alice');
      expect(html).toContain('Bob');
      expect(html).toContain('5 kids');
      expect(html).toContain('2026-06-15');
      expect(html).toContain('2026-06-22');
    });
  });
});
