/**
 * Tests for POST /api/webhooks/asana — Asana inbound webhook handler.
 */
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../server/src/services/prisma';

process.env.NODE_ENV = 'test';
import app from '../../server/src/app';

let eventRequest: any;

beforeAll(async () => {
  eventRequest = await prisma.eventRequest.create({
    data: {
      classSlug: 'python-intro',
      requesterName: 'Webhook Test Requester',
      requesterEmail: 'webhook-test@example.com',
      groupType: 'school',
      expectedHeadcount: 20,
      zipCode: '90210',
      preferredDates: ['2026-05-01'],
      verificationToken: `webhook-token-${Date.now()}`,
      verificationExpiresAt: new Date(Date.now() + 86400000),
      status: 'confirmed',
      asanaTaskId: `mock-task-webhook-${Date.now()}`,
    },
  });
});

afterAll(async () => {
  await prisma.eventRequest.delete({ where: { id: eventRequest.id } });
});

describe('POST /api/webhooks/asana', () => {
  it('handles Asana handshake by echoing X-Hook-Secret', async () => {
    const res = await request(app)
      .post('/api/webhooks/asana')
      .set('X-Hook-Secret', 'my-hook-secret')
      .send({});

    expect(res.status).toBe(200);
    expect(res.headers['x-hook-secret']).toBe('my-hook-secret');
  });

  it('processes task-completed event and transitions request to completed', async () => {
    const taskGid = eventRequest.asanaTaskId;
    const res = await request(app)
      .post('/api/webhooks/asana')
      .send({
        events: [
          { resource: { gid: taskGid }, type: 'task', action: 'completed' },
        ],
      });

    expect(res.status).toBe(200);

    const updated = await prisma.eventRequest.findUnique({ where: { id: eventRequest.id } });
    expect(updated?.status).toBe('completed');
  });

  it('returns 200 for unknown event types without erroring', async () => {
    const res = await request(app)
      .post('/api/webhooks/asana')
      .send({
        events: [
          { resource: { gid: 'some-task' }, type: 'project', action: 'changed' },
        ],
      });

    expect(res.status).toBe(200);
  });

  it('returns 200 for task-deleted events without modifying request', async () => {
    const res = await request(app)
      .post('/api/webhooks/asana')
      .send({
        events: [
          { resource: { gid: eventRequest.asanaTaskId }, type: 'task', action: 'deleted' },
        ],
      });

    expect(res.status).toBe(200);
    // Request should not have changed from 'completed' (already set by previous test)
    const updated = await prisma.eventRequest.findUnique({ where: { id: eventRequest.id } });
    expect(updated?.status).toBe('completed');
  });

  it('returns 200 for empty events array', async () => {
    const res = await request(app)
      .post('/api/webhooks/asana')
      .send({ events: [] });

    expect(res.status).toBe(200);
  });
});
