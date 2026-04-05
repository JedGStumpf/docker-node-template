/**
 * EmailQueueService — manages the outbound email queue lifecycle.
 * Emails are enqueued by EmailService and processed by the scheduled email-sender job.
 */

import { isSqlite } from './prisma';
import type { IEmailTransport, EmailMessage } from './email.service';

const BACKOFF_SCHEDULE = [60, 300, 900, 3600, 14400]; // seconds

export class EmailQueueService {
  constructor(private prisma: any) {}

  /**
   * Enqueue an email message for delivery.
   */
  async enqueue(message: EmailMessage): Promise<any> {
    return this.prisma.emailQueue.create({
      data: {
        recipient: message.to,
        subject: message.subject,
        textBody: message.text,
        htmlBody: message.html || null,
        replyTo: message.replyTo || null,
        attachments: message.attachments ? JSON.stringify(
          message.attachments.map(a => ({
            filename: a.filename,
            content: a.content.toString('base64'),
            contentType: a.contentType,
          }))
        ) : null,
        status: 'pending',
        attempts: 0,
        nextRetryAt: null,
        requestId: message.requestId || null,
      },
    });
  }

  /**
   * Process pending emails from the queue.
   * PostgreSQL: uses FOR UPDATE SKIP LOCKED for concurrency safety.
   * SQLite: simple query (single-writer lock provides natural serialization).
   */
  async processPending(transport: IEmailTransport, batchSize: number = 20): Promise<number> {
    const now = new Date();
    
    let pendingRows: any[];
    if (isSqlite()) {
      pendingRows = await this.prisma.emailQueue.findMany({
        where: {
          status: { in: ['pending', 'failed'] },
          OR: [
            { nextRetryAt: null },
            { nextRetryAt: { lte: now } },
          ],
        },
        orderBy: { createdAt: 'asc' },
        take: batchSize,
      });
    } else {
      pendingRows = await this.prisma.$queryRawUnsafe(`
        SELECT * FROM "EmailQueue"
        WHERE status IN ('pending', 'failed')
          AND ("nextRetryAt" IS NULL OR "nextRetryAt" <= NOW())
        ORDER BY "createdAt" ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      `);
    }

    let sent = 0;
    for (const row of pendingRows) {
      try {
        const message: EmailMessage = {
          to: row.recipient,
          subject: row.subject,
          text: row.textBody,
          html: row.htmlBody || undefined,
          replyTo: row.replyTo || undefined,
          attachments: row.attachments ? JSON.parse(row.attachments).map((a: any) => ({
            filename: a.filename,
            content: Buffer.from(a.content, 'base64'),
            contentType: a.contentType,
          })) : undefined,
        };
        
        await transport.send(message);
        
        await this.prisma.emailQueue.update({
          where: { id: row.id },
          data: { status: 'sent', attempts: row.attempts + 1 },
        });
        sent++;
      } catch (err: any) {
        const newAttempts = row.attempts + 1;
        if (newAttempts >= 5) {
          await this.prisma.emailQueue.update({
            where: { id: row.id },
            data: {
              status: 'dead',
              attempts: newAttempts,
              lastError: (err.message || 'Unknown error').substring(0, 500),
            },
          });
        } else {
          const backoffSeconds = BACKOFF_SCHEDULE[newAttempts - 1] || 14400;
          await this.prisma.emailQueue.update({
            where: { id: row.id },
            data: {
              status: 'failed',
              attempts: newAttempts,
              nextRetryAt: new Date(Date.now() + backoffSeconds * 1000),
              lastError: (err.message || 'Unknown error').substring(0, 500),
            },
          });
        }
      }
    }
    return sent;
  }

  /**
   * List failed/dead queue entries for admin viewing.
   */
  async listFailed(filters?: { status?: string; page?: number; limit?: number }): Promise<{ rows: any[]; total: number }> {
    const status = filters?.status;
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) {
      where.status = status;
    } else {
      where.status = { in: ['failed', 'dead'] };
    }

    const [rows, total] = await Promise.all([
      this.prisma.emailQueue.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.emailQueue.count({ where }),
    ]);

    return { rows, total };
  }

  /**
   * Reset a dead email to pending for retry.
   */
  async retryDead(id: string): Promise<any> {
    const row = await this.prisma.emailQueue.findUnique({ where: { id } });
    if (!row) {
      throw new Error('Email queue entry not found');
    }
    if (row.status !== 'dead') {
      throw new Error('Only dead emails can be retried');
    }
    return this.prisma.emailQueue.update({
      where: { id },
      data: {
        status: 'pending',
        attempts: 0,
        nextRetryAt: null,
        lastError: null,
      },
    });
  }
}
