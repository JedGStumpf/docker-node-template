/**
 * Tests for request status lifecycle transitions.
 * Ticket 002, Sprint 003 — Request status transition state machine.
 */
import request from 'supertest';
import { prisma } from '../../server/src/services/prisma';

process.env.NODE_ENV = 'test';
import app from '../../server/src/app';

const TEST_EMAIL = 'lifecycle-test@example.com';

async function loginAdmin() {
  const agent = request.agent(app);
  await agent
    .post('/api/auth/test-login')
    .send({ pike13UserId: 'admin-lifecycle', role: 'admin', displayName: 'Lifecycle Admin' })
    .expect(200);
  return agent;
}

async function seedRequest(status: string = 'new', extra: Record<string, any> = {}) {
  return prisma.eventRequest.create({
    data: {
      classSlug: 'art-101',
      requesterName: 'Lifecycle Tester',
      requesterEmail: TEST_EMAIL,
      groupType: 'community',
      expectedHeadcount: 15,
      zipCode: '98101',
      preferredDates: ['2026-06-01', '2026-06-08'],
      verificationToken: crypto.randomUUID(),
      verificationExpiresAt: new Date(Date.now() + 3600_000),
      status,
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

describe('Request status lifecycle', () => {
  describe('valid transitions', () => {
    it('new → discussing succeeds', async () => {
      const admin = await loginAdmin();
      const req = await seedRequest('new');

      const res = await admin
        .put(`/api/admin/requests/${req.id}/status`)
        .send({ status: 'discussing' })
        .expect(200);

      expect(res.body.status).toBe('discussing');
    });

    it('discussing → dates_proposed generates registrationToken and stores proposedDates', async () => {
      const admin = await loginAdmin();
      const req = await seedRequest('discussing');

      const res = await admin
        .put(`/api/admin/requests/${req.id}/status`)
        .send({
          status: 'dates_proposed',
          proposedDates: ['2026-06-15', '2026-06-22'],
        })
        .expect(200);

      expect(res.body.status).toBe('dates_proposed');
      expect(res.body.registrationToken).toBeTruthy();
      expect(res.body.registrationToken).toHaveLength(64); // 32 bytes hex
      expect(res.body.proposedDates).toHaveLength(2);
      expect(res.body.minHeadcount).toBe(10); // default
      expect(res.body.votingDeadline).toBeTruthy();
    });

    it('dates_proposed → confirmed succeeds with confirmedDate', async () => {
      const admin = await loginAdmin();
      const req = await seedRequest('dates_proposed', {
        proposedDates: ['2026-06-15'],
        registrationToken: 'a'.repeat(64),
        minHeadcount: 5,
      });

      const res = await admin
        .put(`/api/admin/requests/${req.id}/status`)
        .send({ status: 'confirmed' })
        .expect(200);

      expect(res.body.status).toBe('confirmed');
    });

    it('confirmed → completed succeeds', async () => {
      const admin = await loginAdmin();
      const req = await seedRequest('confirmed');

      const res = await admin
        .put(`/api/admin/requests/${req.id}/status`)
        .send({ status: 'completed' })
        .expect(200);

      expect(res.body.status).toBe('completed');
    });
  });

  describe('cancellation', () => {
    for (const fromStatus of ['new', 'discussing', 'dates_proposed', 'confirmed']) {
      it(`cancellation from ${fromStatus} succeeds`, async () => {
        const admin = await loginAdmin();
        const extra: any = {};
        if (fromStatus === 'dates_proposed') {
          extra.proposedDates = ['2026-06-15'];
          extra.registrationToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
        }
        const req = await seedRequest(fromStatus, extra);

        const res = await admin
          .put(`/api/admin/requests/${req.id}/status`)
          .send({ status: 'cancelled' })
          .expect(200);

        expect(res.body.status).toBe('cancelled');
      });
    }

    it('cancellation from completed returns 422', async () => {
      const admin = await loginAdmin();
      const req = await seedRequest('completed');

      await admin
        .put(`/api/admin/requests/${req.id}/status`)
        .send({ status: 'cancelled' })
        .expect(422);
    });

    it('cancellation from cancelled returns 422', async () => {
      const admin = await loginAdmin();
      const req = await seedRequest('cancelled');

      await admin
        .put(`/api/admin/requests/${req.id}/status`)
        .send({ status: 'cancelled' })
        .expect(422);
    });
  });

  describe('invalid transitions', () => {
    it('new → confirmed returns 422', async () => {
      const admin = await loginAdmin();
      const req = await seedRequest('new');

      const res = await admin
        .put(`/api/admin/requests/${req.id}/status`)
        .send({ status: 'confirmed' })
        .expect(422);

      expect(res.body.error).toContain('Invalid transition');
    });

    it('new → dates_proposed returns 422', async () => {
      const admin = await loginAdmin();
      const req = await seedRequest('new');

      await admin
        .put(`/api/admin/requests/${req.id}/status`)
        .send({ status: 'dates_proposed', proposedDates: ['2026-06-15'] })
        .expect(422);
    });

    it('discussing → confirmed returns 422', async () => {
      const admin = await loginAdmin();
      const req = await seedRequest('discussing');

      await admin
        .put(`/api/admin/requests/${req.id}/status`)
        .send({ status: 'confirmed' })
        .expect(422);
    });
  });

  describe('idempotency', () => {
    it('setting same status returns 200 without error', async () => {
      const admin = await loginAdmin();
      const req = await seedRequest('discussing');

      const res = await admin
        .put(`/api/admin/requests/${req.id}/status`)
        .send({ status: 'discussing' })
        .expect(200);

      expect(res.body.status).toBe('discussing');
    });
  });

  describe('dates_proposed transition details', () => {
    it('requires proposedDates when none exist', async () => {
      const admin = await loginAdmin();
      const req = await seedRequest('discussing');

      await admin
        .put(`/api/admin/requests/${req.id}/status`)
        .send({ status: 'dates_proposed' })
        .expect(422);
    });

    it('sets custom minHeadcount and votingDeadline', async () => {
      const admin = await loginAdmin();
      const req = await seedRequest('discussing');
      const deadline = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

      const res = await admin
        .put(`/api/admin/requests/${req.id}/status`)
        .send({
          status: 'dates_proposed',
          proposedDates: ['2026-07-01'],
          minHeadcount: 20,
          votingDeadline: deadline,
        })
        .expect(200);

      expect(res.body.minHeadcount).toBe(20);
      expect(new Date(res.body.votingDeadline).getTime()).toBeCloseTo(
        new Date(deadline).getTime(),
        -3,
      );
    });

    it('re-entering dates_proposed reuses existing registrationToken', async () => {
      const admin = await loginAdmin();
      const existingToken = 'b'.repeat(64);
      const req = await seedRequest('dates_proposed', {
        proposedDates: ['2026-06-15'],
        registrationToken: existingToken,
        minHeadcount: 5,
      });

      // Idempotent call
      const res = await admin
        .put(`/api/admin/requests/${req.id}/status`)
        .send({ status: 'dates_proposed' })
        .expect(200);

      expect(res.body.registrationToken).toBe(existingToken);
    });
  });

  it('scheduled alias maps to dates_proposed', async () => {
    const admin = await loginAdmin();
    const req = await seedRequest('discussing');

    const res = await admin
      .put(`/api/admin/requests/${req.id}/status`)
      .send({ status: 'scheduled', proposedDates: ['2026-06-15'] })
      .expect(200);

    expect(res.body.status).toBe('dates_proposed');
  });
});
