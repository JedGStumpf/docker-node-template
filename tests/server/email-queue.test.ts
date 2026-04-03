import request from 'supertest';

process.env.NODE_ENV = 'test';

import app from '../../server/src/app';
import { ServiceRegistry } from '../../server/src/services/service.registry';
import { InMemoryEmailTransport } from '../../server/src/services/email.service';

const services = ServiceRegistry.create('UI');
const prisma = services.prisma;

/** Flush the email queue — process all pending emails through the transport */
async function flushQueue(svc: ServiceRegistry): Promise<number> {
  const transport = svc.email.getTransport();
  return svc.emailQueue.processPending(transport, 100);
}

beforeEach(async () => {
  await services.clearAll();
  const transport = services.email.getTransport();
  if (transport instanceof InMemoryEmailTransport) {
    transport.reset();
  }
});

describe('EmailQueueService', () => {
  describe('enqueue()', () => {
    it('creates a pending queue entry', async () => {
      await services.emailQueue.enqueue({
        to: 'test@example.com',
        subject: 'Test Subject',
        text: 'Test Body',
      });

      const rows = await prisma.emailQueue.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0].recipient).toBe('test@example.com');
      expect(rows[0].subject).toBe('Test Subject');
      expect(rows[0].textBody).toBe('Test Body');
      expect(rows[0].status).toBe('pending');
      expect(rows[0].attempts).toBe(0);
    });

    it('serializes attachments as JSON', async () => {
      await services.emailQueue.enqueue({
        to: 'test@example.com',
        subject: 'With Attachment',
        text: 'Body',
        attachments: [{
          filename: 'test.txt',
          content: Buffer.from('hello'),
          contentType: 'text/plain',
        }],
      });

      const row = await prisma.emailQueue.findFirst();
      expect(row!.attachments).toBeTruthy();
      const parsed = JSON.parse(row!.attachments!);
      expect(parsed[0].filename).toBe('test.txt');
      expect(parsed[0].contentType).toBe('text/plain');
    });
  });

  describe('processPending()', () => {
    it('sends pending emails and marks them sent', async () => {
      await services.emailQueue.enqueue({
        to: 'user@example.com',
        subject: 'Hello',
        text: 'World',
      });

      const transport = services.email.getTransport() as InMemoryEmailTransport;
      const sent = await services.emailQueue.processPending(transport, 10);

      expect(sent).toBe(1);
      expect(transport.sent).toHaveLength(1);
      expect(transport.sent[0].to).toBe('user@example.com');

      const row = await prisma.emailQueue.findFirst();
      expect(row!.status).toBe('sent');
      expect(row!.attempts).toBe(1);
    });

    it('retries failed emails with backoff', async () => {
      // Create a row that simulates a previous failure
      await prisma.emailQueue.create({
        data: {
          recipient: 'fail@example.com',
          subject: 'Retry Test',
          textBody: 'Body',
          status: 'failed',
          attempts: 1,
          nextRetryAt: new Date(Date.now() - 1000), // in the past, ready to retry
        },
      });

      const transport = services.email.getTransport() as InMemoryEmailTransport;
      const sent = await services.emailQueue.processPending(transport, 10);

      expect(sent).toBe(1);
      const row = await prisma.emailQueue.findFirst();
      expect(row!.status).toBe('sent');
    });

    it('marks email as dead after 5 failed attempts', async () => {
      // Create a failing transport
      const failTransport = {
        send: async () => { throw new Error('SMTP down'); },
      };

      await prisma.emailQueue.create({
        data: {
          recipient: 'dead@example.com',
          subject: 'Will Die',
          textBody: 'Body',
          status: 'failed',
          attempts: 4,
          nextRetryAt: new Date(Date.now() - 1000),
        },
      });

      const sent = await services.emailQueue.processPending(failTransport, 10);
      expect(sent).toBe(0);

      const row = await prisma.emailQueue.findFirst();
      expect(row!.status).toBe('dead');
      expect(row!.attempts).toBe(5);
      expect(row!.lastError).toContain('SMTP down');
    });

    it('applies exponential backoff on failure', async () => {
      const failTransport = {
        send: async () => { throw new Error('timeout'); },
      };

      await services.emailQueue.enqueue({
        to: 'backoff@example.com',
        subject: 'Backoff Test',
        text: 'Body',
      });

      await services.emailQueue.processPending(failTransport, 10);

      const row = await prisma.emailQueue.findFirst();
      expect(row!.status).toBe('failed');
      expect(row!.attempts).toBe(1);
      expect(row!.nextRetryAt).toBeTruthy();
      // First backoff should be ~60 seconds from now
      const diff = row!.nextRetryAt!.getTime() - Date.now();
      expect(diff).toBeGreaterThan(50000); // at least 50s
      expect(diff).toBeLessThan(70000);    // at most 70s
    });
  });

  describe('retryDead()', () => {
    it('resets a dead email to pending', async () => {
      const entry = await prisma.emailQueue.create({
        data: {
          recipient: 'retry@example.com',
          subject: 'Dead Email',
          textBody: 'Body',
          status: 'dead',
          attempts: 5,
          lastError: 'SMTP error',
        },
      });

      const result = await services.emailQueue.retryDead(entry.id);
      expect(result.status).toBe('pending');
      expect(result.attempts).toBe(0);
      expect(result.lastError).toBeNull();
      expect(result.nextRetryAt).toBeNull();
    });

    it('rejects retry on non-dead email', async () => {
      const entry = await prisma.emailQueue.create({
        data: {
          recipient: 'pending@example.com',
          subject: 'Not Dead',
          textBody: 'Body',
          status: 'pending',
          attempts: 0,
        },
      });

      await expect(services.emailQueue.retryDead(entry.id))
        .rejects.toThrow('Only dead emails can be retried');
    });
  });

  describe('listFailed()', () => {
    it('returns failed and dead entries by default', async () => {
      await prisma.emailQueue.createMany({
        data: [
          { recipient: 'a@x.com', subject: 'A', textBody: 'A', status: 'pending', attempts: 0 },
          { recipient: 'b@x.com', subject: 'B', textBody: 'B', status: 'failed', attempts: 2 },
          { recipient: 'c@x.com', subject: 'C', textBody: 'C', status: 'dead', attempts: 5 },
          { recipient: 'd@x.com', subject: 'D', textBody: 'D', status: 'sent', attempts: 1 },
        ],
      });

      const result = await services.emailQueue.listFailed();
      expect(result.rows).toHaveLength(2);
      expect(result.total).toBe(2);
      const statuses = result.rows.map((r: any) => r.status);
      expect(statuses).toContain('failed');
      expect(statuses).toContain('dead');
    });

    it('filters by specific status', async () => {
      await prisma.emailQueue.createMany({
        data: [
          { recipient: 'a@x.com', subject: 'A', textBody: 'A', status: 'failed', attempts: 1 },
          { recipient: 'b@x.com', subject: 'B', textBody: 'B', status: 'dead', attempts: 5 },
        ],
      });

      const result = await services.emailQueue.listFailed({ status: 'dead' });
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].status).toBe('dead');
    });
  });

  describe('EmailService enqueue integration', () => {
    it('enqueues email when sending verification', async () => {
      await services.email.sendVerificationEmail({
        to: 'verify@example.com',
        requestId: 'req-123',
        token: 'tok-abc',
      });

      // Check queue has the email
      const rows = await prisma.emailQueue.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0].recipient).toBe('verify@example.com');
      expect(rows[0].subject).toContain('Verify');
      expect(rows[0].status).toBe('pending');

      // Transport should NOT have sent yet
      const transport = services.email.getTransport() as InMemoryEmailTransport;
      expect(transport.sent).toHaveLength(0);

      // Flush the queue
      const sent = await flushQueue(services);
      expect(sent).toBe(1);
      expect(transport.sent).toHaveLength(1);
      expect(transport.sent[0].to).toBe('verify@example.com');
    });
  });
});
