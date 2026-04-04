/**
 * Tests for AsanaService.pushExtractionUpdate() — outbound comment posting.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../server/src/services/prisma';
import { AsanaService } from '../../server/src/services/asana.service';
import { MockAsanaClient } from '../../server/src/services/asana.client';

process.env.NODE_ENV = 'test';

let eventRequest: any;

beforeAll(async () => {
  eventRequest = await prisma.eventRequest.create({
    data: {
      classSlug: 'python-intro',
      requesterName: 'Outbound Test Requester',
      requesterEmail: 'outbound-test@example.com',
      groupType: 'school',
      expectedHeadcount: 20,
      zipCode: '90210',
      preferredDates: ['2026-05-01'],
      verificationToken: `outbound-token-${Date.now()}`,
      verificationExpiresAt: new Date(Date.now() + 86400000),
      status: 'confirmed',
      asanaTaskId: 'mock-asana-task-outbound',
    },
  });
});

afterAll(async () => {
  await prisma.eventRequest.delete({ where: { id: eventRequest.id } });
});

describe('AsanaService.pushExtractionUpdate', () => {
  it('posts a comment to the Asana task when token is set', async () => {
    process.env.ASANA_ACCESS_TOKEN = 'fake-test-token';

    const mockClient = new MockAsanaClient();
    const service = new AsanaService(mockClient, prisma);

    await service.pushExtractionUpdate(eventRequest.id, {
      statusSignal: 'confirmed',
      actionItems: ['Send calendar invite', 'Confirm headcount'],
      hostRegistrationCount: 25,
    });

    expect(mockClient.comments).toHaveLength(1);
    expect(mockClient.comments[0].taskGid).toBe('mock-asana-task-outbound');
    expect(mockClient.comments[0].text).toContain('confirmed');
    expect(mockClient.comments[0].text).toContain('Send calendar invite');
    expect(mockClient.comments[0].text).toContain('25');

    delete process.env.ASANA_ACCESS_TOKEN;
  });

  it('skips gracefully when ASANA_ACCESS_TOKEN is not set', async () => {
    delete process.env.ASANA_ACCESS_TOKEN;

    const mockClient = new MockAsanaClient();
    const service = new AsanaService(mockClient, prisma);

    await service.pushExtractionUpdate(eventRequest.id, {
      statusSignal: 'confirmed',
      actionItems: [],
      hostRegistrationCount: null,
    });

    // No comments should be posted
    expect(mockClient.comments).toHaveLength(0);
  });

  it('skips when request has no asanaTaskId', async () => {
    process.env.ASANA_ACCESS_TOKEN = 'fake-test-token';

    const reqWithNoTask = await prisma.eventRequest.create({
      data: {
        classSlug: 'python-intro',
        requesterName: 'No Task Requester',
        requesterEmail: 'no-task@example.com',
        groupType: 'school',
        expectedHeadcount: 20,
        zipCode: '90210',
        preferredDates: ['2026-05-01'],
        verificationToken: `no-task-token-${Date.now()}`,
        verificationExpiresAt: new Date(Date.now() + 86400000),
        status: 'new',
        asanaTaskId: null,
      },
    });

    const mockClient = new MockAsanaClient();
    const service = new AsanaService(mockClient, prisma);

    await service.pushExtractionUpdate(reqWithNoTask.id, {
      statusSignal: 'confirmed',
      actionItems: [],
      hostRegistrationCount: null,
    });

    expect(mockClient.comments).toHaveLength(0);

    await prisma.eventRequest.delete({ where: { id: reqWithNoTask.id } });
    delete process.env.ASANA_ACCESS_TOKEN;
  });
});
