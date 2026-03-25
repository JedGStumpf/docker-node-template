/**
 * Tests for POST /api/requests/:id/verify and RequestService.expireUnverified.
 * Ticket 008 — Request verification & auto-expiry.
 */
import request from 'supertest';
import { prisma } from '../../server/src/services/prisma';

process.env.NODE_ENV = 'test';
import app from '../../server/src/app';

// Helper: create an EventRequest directly in DB with a given expiry
async function seedRequest(overrides: {
  status?: string;
  verificationExpiresAt?: Date;
  verificationToken?: string;
}) {
  const token = overrides.verificationToken || crypto.randomUUID();
  const expiresAt = overrides.verificationExpiresAt || new Date(Date.now() + 60 * 60 * 1000);
  return prisma.eventRequest.create({
    data: {
      classSlug: 'python-intro',
      requesterName: 'Test Requester',
      requesterEmail: 'verify-test@example.com',
      groupType: 'school',
      expectedHeadcount: 20,
      zipCode: '90210',
      preferredDates: ['2026-05-01'],
      verificationToken: token,
      verificationExpiresAt: expiresAt,
      status: overrides.status || 'unverified',
    },
  });
}

afterAll(async () => {
  await prisma.instructorAssignment.deleteMany({
    where: {
      request: {
        requesterEmail: 'verify-test@example.com',
      },
    },
  }).catch(() => {});
  await prisma.eventRequest.deleteMany({
    where: { requesterEmail: 'verify-test@example.com' },
  }).catch(() => {});
});

describe('POST /api/requests/:id/verify', () => {
  it('returns 200 + status:new for a valid token within the expiry window', async () => {
    const rec = await seedRequest({});
    const res = await request(app)
      .post(`/api/requests/${rec.id}/verify`)
      .send({ token: rec.verificationToken });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('new');
  });

  it('updates EventRequest.status to new in the database', async () => {
    const rec = await seedRequest({});
    await request(app)
      .post(`/api/requests/${rec.id}/verify`)
      .send({ token: rec.verificationToken });

    const updated = await prisma.eventRequest.findUnique({ where: { id: rec.id } });
    expect(updated!.status).toBe('new');
  });

  it('returns 410 when the verification token is past its expiry', async () => {
    const expired = new Date(Date.now() - 1000); // 1 second in the past
    const rec = await seedRequest({ verificationExpiresAt: expired });
    const res = await request(app)
      .post(`/api/requests/${rec.id}/verify`)
      .send({ token: rec.verificationToken });
    expect(res.status).toBe(410);
  });

  it('returns 400 when the token is incorrect', async () => {
    const rec = await seedRequest({});
    const res = await request(app)
      .post(`/api/requests/${rec.id}/verify`)
      .send({ token: 'wrong-token-value' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown request ID', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app)
      .post(`/api/requests/${fakeId}/verify`)
      .send({ token: 'any-token' });
    expect(res.status).toBe(404);
  });

  it('returns 400 when token is missing from request', async () => {
    const rec = await seedRequest({});
    const res = await request(app)
      .post(`/api/requests/${rec.id}/verify`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('is idempotent — returns 200 when already verified (status: new)', async () => {
    const rec = await seedRequest({ status: 'new' });
    const res = await request(app)
      .post(`/api/requests/${rec.id}/verify`)
      .send({ token: rec.verificationToken });
    // Idempotent: already new → return 200 without re-processing
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('new');
  });

  it('accepts token from query string as well as body', async () => {
    const rec = await seedRequest({});
    const res = await request(app)
      .post(`/api/requests/${rec.id}/verify?token=${rec.verificationToken}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('new');
  });
});

describe('RequestService.expireUnverified', () => {
  it('deletes unverified requests past their expiry', async () => {
    const past = new Date(Date.now() - 1000); // expired 1s ago
    const rec = await seedRequest({ verificationExpiresAt: past });

    const { RequestService } = await import('../../server/src/services/request.service.js');
    const svc = new RequestService(prisma);
    const count = await svc.expireUnverified();

    expect(count).toBeGreaterThanOrEqual(1);
    const stillExists = await prisma.eventRequest.findUnique({ where: { id: rec.id } });
    expect(stillExists).toBeNull();
  });

  it('does not delete requests with a future expiry', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const rec = await seedRequest({ verificationExpiresAt: future });

    const { RequestService } = await import('../../server/src/services/request.service.js');
    const svc = new RequestService(prisma);
    await svc.expireUnverified();

    const stillExists = await prisma.eventRequest.findUnique({ where: { id: rec.id } });
    expect(stillExists).not.toBeNull();

    // Cleanup
    await prisma.eventRequest.delete({ where: { id: rec.id } });
  });

  it('does not delete requests in new or later statuses even if past expiry time', async () => {
    const past = new Date(Date.now() - 1000);
    // A verified (new) request — should NOT be deleted
    const rec = await seedRequest({ status: 'new', verificationExpiresAt: past });

    const { RequestService } = await import('../../server/src/services/request.service.js');
    const svc = new RequestService(prisma);
    await svc.expireUnverified();

    const stillExists = await prisma.eventRequest.findUnique({ where: { id: rec.id } });
    expect(stillExists).not.toBeNull();

    // Cleanup
    await prisma.eventRequest.delete({ where: { id: rec.id } });
  });
});
