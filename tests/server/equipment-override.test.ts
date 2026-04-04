/**
 * Route tests for POST /api/assignments/:id/equipment-status/override
 */
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../server/src/services/prisma';

process.env.NODE_ENV = 'test';
import app from '../../server/src/app';

let instructor: any;
let eventReq: any;
let assignment: any;

beforeAll(async () => {
  instructor = await prisma.instructorProfile.create({
    data: {
      pike13UserId: 'equip-override-instructor',
      displayName: 'Override Test Instructor',
      email: 'equip-override@example.com',
      topics: ['python-intro'],
      homeZip: '90210',
      maxTravelMinutes: 60,
    },
  });

  eventReq = await prisma.eventRequest.create({
    data: {
      classSlug: 'python-intro',
      requesterName: 'Override Requester',
      requesterEmail: 'override-req@example.com',
      groupType: 'school',
      expectedHeadcount: 20,
      zipCode: '90210',
      preferredDates: ['2026-05-01'],
      verificationToken: `equip-override-token-${Date.now()}`,
      verificationExpiresAt: new Date(Date.now() + 86400000),
      status: 'confirmed',
    },
  });

  assignment = await prisma.instructorAssignment.create({
    data: {
      requestId: eventReq.id,
      instructorId: instructor.id,
      status: 'accepted',
      notificationToken: `equip-override-notif-${Date.now()}`,
      notifiedAt: new Date(),
      equipmentStatus: 'pending_checkout',
    },
  });
});

afterAll(async () => {
  await prisma.instructorAssignment.deleteMany({ where: { requestId: eventReq.id } });
  await prisma.eventRequest.delete({ where: { id: eventReq.id } });
  await prisma.instructorProfile.deleteMany({ where: { pike13UserId: 'equip-override-instructor' } });
});

describe('POST /api/assignments/:id/equipment-status/override', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await request(app)
      .post(`/api/assignments/${assignment.id}/equipment-status/override`)
      .send({ status: 'ready' });
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid status value', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/test-login')
      .send({ email: 'override-admin@example.com', displayName: 'Override Admin', role: 'ADMIN' });

    const res = await agent
      .post(`/api/assignments/${assignment.id}/equipment-status/override`)
      .send({ status: 'invalid' });
    expect(res.status).toBe(400);
  });

  it('overrides equipment status to ready for admin', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/test-login')
      .send({ email: 'override-admin@example.com', displayName: 'Override Admin', role: 'ADMIN' });

    const res = await agent
      .post(`/api/assignments/${assignment.id}/equipment-status/override`)
      .send({ status: 'ready', note: 'Instructor confirmed verbally' });

    expect(res.status).toBe(200);
    expect(res.body.equipmentStatus).toBe('ready');
    expect(res.body.id).toBe(assignment.id);
    expect(res.body).toHaveProperty('overriddenAt');

    // Verify DB state
    const updated = await prisma.instructorAssignment.findUnique({ where: { id: assignment.id } });
    expect(updated?.equipmentStatus).toBe('ready');
  });

  it('overrides equipment status to unknown for admin', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/test-login')
      .send({ email: 'override-admin@example.com', displayName: 'Override Admin', role: 'ADMIN' });

    const res = await agent
      .post(`/api/assignments/${assignment.id}/equipment-status/override`)
      .send({ status: 'unknown' });

    expect(res.status).toBe(200);
    expect(res.body.equipmentStatus).toBe('unknown');
  });
});
