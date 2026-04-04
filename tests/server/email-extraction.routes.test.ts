/**
 * Integration tests for email extraction admin routes.
 * - GET /api/admin/requests/:id includes latestExtraction
 * - POST /api/admin/requests/:id/apply-extraction/:extractionId applies status signal
 */
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../server/src/services/prisma';

process.env.NODE_ENV = 'test';
import app from '../../server/src/app';

let eventRequest: any;
let extraction: any;

async function loginPike13Admin() {
  const agent = request.agent(app);
  await agent
    .post('/api/auth/test-login')
    .send({ pike13UserId: 'extraction-admin', role: 'admin', displayName: 'Extraction Admin' })
    .expect(200);
  return agent;
}

beforeAll(async () => {
  eventRequest = await prisma.eventRequest.create({
    data: {
      classSlug: 'python-intro',
      requesterName: 'Extraction Route Requester',
      requesterEmail: 'ext-route-req@example.com',
      groupType: 'school',
      expectedHeadcount: 20,
      zipCode: '90210',
      preferredDates: ['2026-05-01'],
      verificationToken: `ext-route-token-${Date.now()}`,
      verificationExpiresAt: new Date(Date.now() + 86400000),
      status: 'new',
    },
  });

  extraction = await prisma.emailExtraction.create({
    data: {
      emailId: 'email-route-test',
      requestId: eventRequest.id,
      statusSignal: 'confirmed',
      actionItems: ['Send calendar invite'],
      hostRegistrationCount: 30,
    },
  });
});

afterAll(async () => {
  await prisma.emailExtraction.deleteMany({ where: { requestId: eventRequest.id } });
  await prisma.eventRequest.delete({ where: { id: eventRequest.id } });
});

describe('GET /api/admin/requests/:id — with extraction', () => {
  it('includes latestExtraction in response', async () => {
    const agent = await loginPike13Admin();
    const res = await agent.get(`/api/admin/requests/${eventRequest.id}`);
    expect(res.status).toBe(200);
    expect(res.body.latestExtraction).not.toBeNull();
    expect(res.body.latestExtraction.statusSignal).toBe('confirmed');
    expect(res.body.latestExtraction.hostRegistrationCount).toBe(30);
  });
});

describe('POST /api/admin/requests/:id/apply-extraction/:extractionId', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await request(app)
      .post(`/api/admin/requests/${eventRequest.id}/apply-extraction/${extraction.id}`);
    expect(res.status).toBe(401);
  });

  it('applies the signal and sets appliedAt', async () => {
    const agent = await loginPike13Admin();
    const res = await agent
      .post(`/api/admin/requests/${eventRequest.id}/apply-extraction/${extraction.id}`);

    expect(res.status).toBe(200);
    expect(res.body.extraction.appliedAt).not.toBeNull();
    expect(res.body.request.status).toBe('confirmed');

    // Verify DB state
    const updatedRequest = await prisma.eventRequest.findUnique({ where: { id: eventRequest.id } });
    expect(updatedRequest?.status).toBe('confirmed');
  });

  it('returns 404 for non-existent extraction', async () => {
    const agent = await loginPike13Admin();
    const res = await agent
      .post(`/api/admin/requests/${eventRequest.id}/apply-extraction/nonexistent-id`);
    expect(res.status).toBe(404);
  });
});
