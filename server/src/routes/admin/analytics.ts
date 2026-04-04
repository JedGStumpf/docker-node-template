/**
 * Admin analytics route — Sprint 5
 * GET /api/admin/analytics — event funnel, instructor utilization, registration counts
 */
import { Router, Request, Response } from 'express';

export const adminAnalyticsRouter = Router();

adminAnalyticsRouter.get('/analytics', async (req: Request, res: Response) => {
  try {
    const DEFAULT_PERIOD_DAYS = 90;
    const now = new Date();

    let from: Date;
    let to: Date = now;

    if (req.query.from && typeof req.query.from === 'string') {
      from = new Date(req.query.from);
      if (isNaN(from.getTime())) {
        return res.status(400).json({ error: 'Invalid from date' });
      }
    } else {
      from = new Date(now.getTime() - DEFAULT_PERIOD_DAYS * 24 * 3600 * 1000);
    }

    if (req.query.to && typeof req.query.to === 'string') {
      to = new Date(req.query.to);
      if (isNaN(to.getTime())) {
        return res.status(400).json({ error: 'Invalid to date' });
      }
    }

    const period = { from, to };

    const [funnel, utilization, registrations] = await Promise.all([
      req.services.analytics.getEventFunnel(period),
      req.services.analytics.getInstructorUtilization(period),
      req.services.analytics.getRegistrationCounts(period),
    ]);

    res.json({
      period: { from, to },
      eventFunnel: funnel,
      instructorUtilization: utilization,
      registrations,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch analytics', detail: err.message });
  }
});
