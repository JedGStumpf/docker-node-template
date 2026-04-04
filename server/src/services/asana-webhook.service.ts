/**
 * AsanaWebhookService — handles inbound Asana webhook events.
 *
 * Asana webhook flow:
 * 1. Handshake: Asana sends POST with X-Hook-Secret header + no events.
 *    We echo the header value back and store it for subsequent verification.
 * 2. Events: Subsequent POSTs contain { events: [{ resource, type, action }] }.
 *    We map events to EventRequest status changes.
 *
 * Signature verification: optional, via ASANA_WEBHOOK_SECRET env var.
 */

import crypto from 'crypto';

export interface AsanaWebhookEvent {
  resource?: { gid?: string };
  type?: string;
  action?: string;
}

export interface AsanaWebhookPayload {
  events?: AsanaWebhookEvent[];
}

export class AsanaWebhookService {
  constructor(private prisma: any) {}

  /**
   * Verify the X-Hook-Signature header if ASANA_WEBHOOK_SECRET is set.
   * Returns true if valid or if no secret is configured.
   */
  verifySignature(rawBody: string, signature: string): boolean {
    const secret = process.env.ASANA_WEBHOOK_SECRET;
    if (!secret) return true; // Skip verification in dev

    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const sigBuffer = Buffer.from(signature || '', 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');

    if (sigBuffer.length !== expectedBuffer.length) return false;
    return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  }

  /**
   * Process a batch of Asana webhook events.
   * Returns a summary of actions taken.
   */
  async processEvents(payload: AsanaWebhookPayload): Promise<{ processed: number; errors: string[] }> {
    const events = payload.events || [];
    let processed = 0;
    const errors: string[] = [];

    for (const event of events) {
      try {
        await this.processEvent(event);
        processed++;
      } catch (err: any) {
        errors.push(err.message);
      }
    }

    return { processed, errors };
  }

  private async processEvent(event: AsanaWebhookEvent): Promise<void> {
    const taskGid = event.resource?.gid;
    const type = event.type;
    const action = event.action;

    if (!taskGid || !type) {
      console.log(`AsanaWebhook: skipping event with no resource.gid or type`);
      return;
    }

    if (type === 'task' && action === 'deleted') {
      console.log(`AsanaWebhook: task ${taskGid} deleted — ignoring`);
      return;
    }

    if (type === 'task' && action === 'changed') {
      console.log(`AsanaWebhook: task ${taskGid} changed — flagged for admin review`);
      // SSE notification to admin dashboard would go here — placeholder for now
      return;
    }

    if (type === 'task' && action === 'completed') {
      await this.handleTaskCompleted(taskGid);
      return;
    }

    console.log(`AsanaWebhook: unknown event type=${type} action=${action} for task ${taskGid}`);
  }

  private async handleTaskCompleted(taskGid: string): Promise<void> {
    const request = await this.prisma.eventRequest.findFirst({
      where: { asanaTaskId: taskGid },
    });

    if (!request) {
      console.log(`AsanaWebhook: no request found for task ${taskGid}`);
      return;
    }

    // Only transition requests that are in-flight
    if (!['discussing', 'confirmed', 'dates_proposed'].includes(request.status)) {
      console.log(
        `AsanaWebhook: request ${request.id} is in status ${request.status} — skipping completion transition`,
      );
      return;
    }

    await this.prisma.eventRequest.update({
      where: { id: request.id },
      data: { status: 'completed' },
    });

    console.log(`AsanaWebhook: request ${request.id} transitioned to completed via task completion`);
  }
}
