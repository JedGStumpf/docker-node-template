/**
 * Unit tests for EmailExtractionService.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../server/src/services/prisma';
import { EmailExtractionService, MockAnthropicClient } from '../../server/src/services/email-extraction.service';

process.env.NODE_ENV = 'test';

let eventRequest: any;

beforeAll(async () => {
  eventRequest = await prisma.eventRequest.create({
    data: {
      classSlug: 'python-intro',
      requesterName: 'Extraction Test Requester',
      requesterEmail: 'extraction-test@example.com',
      groupType: 'school',
      expectedHeadcount: 20,
      zipCode: '90210',
      preferredDates: ['2026-05-01'],
      verificationToken: `extraction-svc-token-${Date.now()}`,
      verificationExpiresAt: new Date(Date.now() + 86400000),
      status: 'new',
    },
  });
});

afterAll(async () => {
  await prisma.emailExtraction.deleteMany({ where: { requestId: eventRequest.id } });
  await prisma.eventRequest.delete({ where: { id: eventRequest.id } });
});

describe('EmailExtractionService', () => {
  it('stores extraction record when anthropic client is present', async () => {
    const mockClient = new MockAnthropicClient({
      statusSignal: 'confirmed',
      actionItems: ['Send calendar invite', 'Confirm headcount'],
      hostRegistrationCount: 25,
    });
    const service = new EmailExtractionService(prisma, mockClient);

    const result = await service.extractFromEmail(
      'email-123',
      eventRequest.id,
      'Hi team, we confirmed the event. We have 25 registered.',
    );

    expect(result).not.toBeNull();
    expect(result.statusSignal).toBe('confirmed');
    expect(result.actionItems).toContain('Send calendar invite');
    expect(result.hostRegistrationCount).toBe(25);
    expect(result.requestId).toBe(eventRequest.id);
    expect(result.emailId).toBe('email-123');
  });

  it('returns null gracefully when anthropic client is null (no API key)', async () => {
    const service = new EmailExtractionService(prisma, null);

    const result = await service.extractFromEmail(
      'email-456',
      eventRequest.id,
      'Some email body',
    );

    expect(result).toBeNull();
  });

  it('returns null when client throws', async () => {
    const throwingClient = {
      async extractFromEmailBody(_body: string) {
        throw new Error('API error');
      },
    };
    const service = new EmailExtractionService(prisma, throwingClient as any);

    const result = await service.extractFromEmail(
      'email-789',
      eventRequest.id,
      'Some email body',
    );

    expect(result).toBeNull();
  });

  it('getLatestExtraction returns the most recent extraction', async () => {
    const service = new EmailExtractionService(prisma, new MockAnthropicClient());
    const latest = await service.getLatestExtraction(eventRequest.id);
    expect(latest).not.toBeNull();
    expect(latest.requestId).toBe(eventRequest.id);
  });
});
