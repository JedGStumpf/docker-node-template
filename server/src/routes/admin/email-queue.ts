import { Router, Request, Response } from 'express';

export const adminEmailQueueRouter = Router();

/** GET /api/admin/email-queue — List email queue entries with optional status filter */
adminEmailQueueRouter.get('/email-queue', async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

    // Validate status if provided
    const validStatuses = ['pending', 'sent', 'failed', 'dead'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const result = await req.services.emailQueue.listFailed({ status, page, limit });
    return res.json({ rows: result.rows, total: result.total, page, limit });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to list email queue', detail: err.message });
  }
});

/** POST /api/admin/email-queue/:id/retry — Retry a dead email */
adminEmailQueueRouter.post('/email-queue/:id/retry', async (req: Request, res: Response) => {
  try {
    const updated = await req.services.emailQueue.retryDead(req.params.id);
    return res.json(updated);
  } catch (err: any) {
    if (err.message === 'Email queue entry not found') {
      return res.status(404).json({ error: err.message });
    }
    if (err.message === 'Only dead emails can be retried') {
      return res.status(422).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Failed to retry email', detail: err.message });
  }
});
