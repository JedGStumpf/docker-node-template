/**
 * Tests for date finalization — threshold crossing, tiebreaker,
 * manual finalization, idempotent re-finalization.
 * Ticket 004, Sprint 003.
 */
import { prisma } from '../../server/src/services/prisma';
import { RegistrationService } from '../../server/src/services/registration.service';

process.env.NODE_ENV = 'test';

const TEST_EMAIL = 'finalize-test@example.com';
const REG_TOKEN = 'b'.repeat(64);

let service: RegistrationService;

beforeAll(() => {
  service = new RegistrationService(prisma);
});

async function seedRequest(extra: Record<string, any> = {}) {
  return prisma.eventRequest.create({
    data: {
      classSlug: 'art-101',
      requesterName: 'Finalize Tester',
      requesterEmail: TEST_EMAIL,
      groupType: 'school',
      expectedHeadcount: 20,
      zipCode: '90210',
      preferredDates: ['2026-06-01'],
      verificationToken: crypto.randomUUID(),
      verificationExpiresAt: new Date(Date.now() + 3600_000),
      status: 'dates_proposed',
      registrationToken: REG_TOKEN,
      proposedDates: ['2026-06-15', '2026-06-22', '2026-06-29'],
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

describe('Date finalization', () => {
  describe('checkAndFinalizeThreshold', () => {
    it('auto-finalizes when a date reaches the threshold', async () => {
      const req = await seedRequest();
      // Add registrations totaling 5 kids for June 15
      await prisma.registration.create({
        data: {
          requestId: req.id,
          attendeeName: 'Alice',
          attendeeEmail: 'alice@example.com',
          numberOfKids: 3,
          availableDates: ['2026-06-15'],
        },
      });
      await prisma.registration.create({
        data: {
          requestId: req.id,
          attendeeName: 'Bob',
          attendeeEmail: 'bob@example.com',
          numberOfKids: 2,
          availableDates: ['2026-06-15'],
        },
      });

      const result = await service.checkAndFinalizeThreshold(req.id);
      expect(result).not.toBeNull();

      const updated = await prisma.eventRequest.findUnique({ where: { id: req.id } });
      expect(updated.status).toBe('confirmed');
      expect(updated.confirmedDate).toBeTruthy();
    });

    it('does not finalize when no date meets threshold', async () => {
      const req = await seedRequest();
      await prisma.registration.create({
        data: {
          requestId: req.id,
          attendeeName: 'Carol',
          attendeeEmail: 'carol@example.com',
          numberOfKids: 2,
          availableDates: ['2026-06-15'],
        },
      });

      const result = await service.checkAndFinalizeThreshold(req.id);
      expect(result).toBeNull();

      const updated = await prisma.eventRequest.findUnique({ where: { id: req.id } });
      expect(updated.status).toBe('dates_proposed');
    });

    it('tiebreaker: picks highest kid count, then earliest date', async () => {
      const req = await seedRequest();
      // 5 kids on June 22 and 5 kids on June 15 — should pick June 15 (earliest)
      await prisma.registration.create({
        data: {
          requestId: req.id,
          attendeeName: 'Dave',
          attendeeEmail: 'dave@example.com',
          numberOfKids: 5,
          availableDates: ['2026-06-22'],
        },
      });
      await prisma.registration.create({
        data: {
          requestId: req.id,
          attendeeName: 'Eve',
          attendeeEmail: 'eve@example.com',
          numberOfKids: 5,
          availableDates: ['2026-06-15'],
        },
      });

      await service.checkAndFinalizeThreshold(req.id);
      const updated = await prisma.eventRequest.findUnique({ where: { id: req.id } });
      expect(updated.status).toBe('confirmed');
      // Earliest date wins on tie
      const confirmedStr = new Date(updated.confirmedDate).toISOString().slice(0, 10);
      expect(confirmedStr).toBe('2026-06-15');
    });
  });

  describe('finalizeDate', () => {
    it('manually finalizes a specific date', async () => {
      const req = await seedRequest();
      await prisma.registration.create({
        data: {
          requestId: req.id,
          attendeeName: 'Frank',
          attendeeEmail: 'frank@example.com',
          numberOfKids: 2,
          availableDates: ['2026-06-22'],
        },
      });

      const result = await service.finalizeDate(req.id, '2026-06-22');
      expect(result.status).toBe('confirmed');

      const reg = await prisma.registration.findFirst({
        where: { requestId: req.id, attendeeEmail: 'frank@example.com' },
      });
      expect(reg.status).toBe('confirmed');
    });

    it('updates registrant statuses: confirmed for matching, declined for non-matching', async () => {
      const req = await seedRequest();
      await prisma.registration.create({
        data: {
          requestId: req.id,
          attendeeName: 'Grace',
          attendeeEmail: 'grace@example.com',
          numberOfKids: 3,
          availableDates: ['2026-06-15'],
        },
      });
      await prisma.registration.create({
        data: {
          requestId: req.id,
          attendeeName: 'Hank',
          attendeeEmail: 'hank@example.com',
          numberOfKids: 1,
          availableDates: ['2026-06-22'],
        },
      });

      await service.finalizeDate(req.id, '2026-06-15');

      const grace = await prisma.registration.findFirst({
        where: { requestId: req.id, attendeeEmail: 'grace@example.com' },
      });
      const hank = await prisma.registration.findFirst({
        where: { requestId: req.id, attendeeEmail: 'hank@example.com' },
      });
      expect(grace.status).toBe('confirmed');
      expect(hank.status).toBe('declined');
    });

    it('is idempotent — returns early if already confirmed', async () => {
      const req = await seedRequest({ status: 'confirmed', confirmedDate: new Date('2026-06-15') });
      const result = await service.finalizeDate(req.id, '2026-06-15');
      expect(result.status).toBe('confirmed');
    });

    it('returns 422 if request not in dates_proposed status', async () => {
      const req = await seedRequest({ status: 'discussing' });
      await expect(
        service.finalizeDate(req.id, '2026-06-15'),
      ).rejects.toThrow(/must be in dates_proposed status/);
    });
  });
});

// ── Ticket 006: Admin event configuration & manual finalization route tests ──

import request from 'supertest';
process.env.NODE_ENV = 'test';
import app from '../../server/src/app';

describe('Admin event configuration routes', () => {
  async function loginAdmin() {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/test-login')
      .send({ pike13UserId: 'admin-finalize', role: 'admin', displayName: 'Finalize Admin' })
      .expect(200);
    return agent;
  }

  describe('PUT /api/admin/requests/:id', () => {
    it('updates minHeadcount and eventType', async () => {
      const admin = await loginAdmin();
      const req = await seedRequest();

      const res = await admin
        .put(`/api/admin/requests/${req.id}`)
        .send({ minHeadcount: 8, eventType: 'public' })
        .expect(200);

      expect(res.body.minHeadcount).toBe(8);
      expect(res.body.eventType).toBe('public');
    });

    it('rejects invalid minHeadcount', async () => {
      const admin = await loginAdmin();
      const req = await seedRequest();

      await admin
        .put(`/api/admin/requests/${req.id}`)
        .send({ minHeadcount: -1 })
        .expect(400);
    });

    it('rejects proposedDates update when status is confirmed', async () => {
      const admin = await loginAdmin();
      const req = await seedRequest({ status: 'confirmed' });

      await admin
        .put(`/api/admin/requests/${req.id}`)
        .send({ proposedDates: ['2026-07-01'] })
        .expect(422);
    });

    it('requires admin auth', async () => {
      const req = await seedRequest();
      await request(app)
        .put(`/api/admin/requests/${req.id}`)
        .send({ minHeadcount: 10 })
        .expect(401);
    });
  });

  describe('POST /api/admin/requests/:id/finalize-date', () => {
    it('manually finalizes a proposed date', async () => {
      const admin = await loginAdmin();
      const req = await seedRequest();
      await prisma.registration.create({
        data: {
          requestId: req.id,
          attendeeName: 'Manual',
          attendeeEmail: 'manual@example.com',
          numberOfKids: 1,
          availableDates: ['2026-06-15'],
        },
      });

      const res = await admin
        .post(`/api/admin/requests/${req.id}/finalize-date`)
        .send({ date: '2026-06-15' })
        .expect(200);

      expect(res.body.status).toBe('confirmed');
    });

    it('returns 422 for date not in proposed dates', async () => {
      const admin = await loginAdmin();
      const req = await seedRequest();

      await admin
        .post(`/api/admin/requests/${req.id}/finalize-date`)
        .send({ date: '2099-01-01' })
        .expect(422);
    });

    it('returns 422 when request not in dates_proposed', async () => {
      const admin = await loginAdmin();
      const req = await seedRequest({ status: 'discussing' });

      await admin
        .post(`/api/admin/requests/${req.id}/finalize-date`)
        .send({ date: '2026-06-15' })
        .expect(422);
    });

    it('admin can finalize even if headcount threshold not met', async () => {
      const admin = await loginAdmin();
      const req = await seedRequest({ minHeadcount: 100 }); // Very high threshold

      const res = await admin
        .post(`/api/admin/requests/${req.id}/finalize-date`)
        .send({ date: '2026-06-15' })
        .expect(200);

      expect(res.body.status).toBe('confirmed');
    });
  });
});
