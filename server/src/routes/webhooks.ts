/**
 * Webhook routes — Sprint 5
 * POST /api/webhooks/asana — Asana webhook handler (handshake + events)
 */
import { Router, Request, Response } from 'express';

export const webhooksRouter = Router();

webhooksRouter.post('/webhooks/asana', async (req: Request, res: Response) => {
  try {
    // Asana handshake: X-Hook-Secret present, no events body
    const hookSecret = req.headers['x-hook-secret'];
    if (hookSecret) {
      // Store the secret for future use
      const secretValue = Array.isArray(hookSecret) ? hookSecret[0] : hookSecret;
      try {
        await req.services.config.set('asana_webhook_secret', secretValue);
      } catch {
        // Config set may fail — still return the handshake
      }
      res.setHeader('X-Hook-Secret', secretValue);
      return res.status(200).json({ ok: true });
    }

    // Optional signature verification
    const signature = req.headers['x-hook-signature'];
    if (signature) {
      const rawBody = JSON.stringify(req.body);
      const sigStr = Array.isArray(signature) ? signature[0] : signature;
      const valid = req.services.asanaWebhook.verifySignature(rawBody, sigStr);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }
    }

    // Process events
    const payload = req.body || {};
    const result = await req.services.asanaWebhook.processEvents(payload);

    return res.status(200).json(result);
  } catch (err: any) {
    console.error('AsanaWebhook: handler error', err);
    // Always return 200 to Asana (otherwise it stops retrying)
    return res.status(200).json({ ok: true, error: err.message });
  }
});
