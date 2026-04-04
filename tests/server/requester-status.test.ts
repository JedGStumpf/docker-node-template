/**
 * Tests for GET /api/requests/:id/status — public tokenized status endpoint.
 */
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../../server/src/app';
import { prisma } from '../../server/src/services/prisma';

let requestId: string;
const REGISTRATION_TOKEN = 'test-registration-token-abc123';
const VERIFICATION_TOKEN = 'test-verification-token-xyz789';

beforeAll(async () => {
  // Create a test EventRequest with a known registrationToken
  const eventRequest = await (prisma as any).eventRequest.create({
    data: {
      classSlug: 'python-intro',
      requesterName: 'Test Requester',
      requesterEmail: 'requester@test.com',
      groupType: 'school',
      expectedHeadcount: 25,
      zipCode: '92101',
      preferredDates: JSON.stringify(['2026-05-01']),
      locationFreeText: 'Test location',
      status: 'new',
      verificationToken: VERIFICATION_TOKEN,
      verificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      registrationToken: REGISTRATION_TOKEN,
    },
  });
  requestId = eventRequest.id;
});

afterAll(async () => {
  await (prisma as any).eventRequest.deleteMany({ where: { id: requestId } });
});

describe('GET /api/requests/:id/status', () => {
  it('returns 200 with status DTO for valid token', async () => {
    const res = await request(app)
      .get(`/api/requests/${requestId}/status?token=${REGISTRATION_TOKEN}`)
      .expect(200);

    expect(res.body.id).toBe(requestId);
    expect(res.body.status).toBe('new');
    expect(res.body.classSlug).toBe('python-intro');
    expect(res.body.registrationCount).toBe(0);
    expect(res.body.publicEventUrl).toBeNull();
    // Must NOT contain internal fields
    expect(res.body.verificationToken).toBeUndefined();
    expect(res.body.registrationToken).toBeUndefined();
    expect(res.body.assignedInstructorId).toBeUndefined();
    expect(res.body.emailThreadAddress).toBeUndefined();
  });

  it('returns 404 for wrong token', async () => {
    await request(app)
      .get(`/api/requests/${requestId}/status?token=wrong-token`)
      .expect(404);
  });

  it('returns 404 for missing token', async () => {
    await request(app)
      .get(`/api/requests/${requestId}/status`)
      .expect(404);
  });

  it('returns 404 for nonexistent request id', async () => {
    await request(app)
      .get(`/api/requests/nonexistent-id-00000000/status?token=any-token`)
      .expect(404);
  });
});
