/**
 * Instructor routes — Sprint 1.
 *
 * GET  /api/instructor/profile  — get own profile
 * PUT  /api/instructor/profile  — create or update own profile
 * POST /api/instructor/assignments/:id/accept — accept match (token-based)
 * POST /api/instructor/assignments/:id/decline — decline match (token-based)
 */
import { Router, Request, Response } from 'express';
import { requireInstructor } from '../middleware/requirePike13';
import { ServiceError } from '../errors';

export const instructorRouter = Router();

function firstString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

/** GET /api/instructor/profile */
instructorRouter.get('/instructor/profile', requireInstructor, async (req: Request, res: Response) => {
  try {
    const pike13UserId = (req.session as any).pike13UserId as string;
    const profile = await req.services.instructors.getProfile(pike13UserId);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    res.json(profile);
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** PUT /api/instructor/profile */
instructorRouter.put('/instructor/profile', requireInstructor, async (req: Request, res: Response) => {
  try {
    const pike13UserId = (req.session as any).pike13UserId as string;
    const displayName = (req.session as any).pike13DisplayName || req.body.displayName || '';
    const email = (req.session as any).pike13Email || req.body.email || '';

    const { topics, homeZip, maxTravelMinutes, serviceZips, active } = req.body;

    const profile = await req.services.instructors.upsertProfile({
      pike13UserId,
      displayName,
      email,
      topics,
      homeZip,
      maxTravelMinutes,
      serviceZips,
      active,
    });

    res.json(profile);
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/instructor/assignments/:id/accept */
instructorRouter.post('/instructor/assignments/:id/accept', async (req: Request, res: Response) => {
  try {
    const id = firstString(req.params.id);
    const token = firstString(req.query.token) || firstString(req.body?.token);

    if (!id || !token) {
      return res.status(400).json({ error: 'notification token required' });
    }

    const assignment = await req.services.instructors.handleAssignmentResponse(id, token, 'accept');
    res.json(assignment);
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/instructor/assignments/:id/decline */
instructorRouter.post('/instructor/assignments/:id/decline', async (req: Request, res: Response) => {
  try {
    const id = firstString(req.params.id);
    const token = firstString(req.query.token) || firstString(req.body?.token);

    if (!id || !token) {
      return res.status(400).json({ error: 'notification token required' });
    }

    const assignment = await req.services.instructors.handleAssignmentResponse(id, token, 'decline');

    // Trigger advance-to-next logic
    if (assignment.status === 'declined') {
      try {
        await req.services.instructors.advanceToNextInstructor(
          assignment,
          req.services.email,
          req.services.matching,
        );
      } catch {
        // Don't fail the decline response if advance fails
      }
    }

    res.json(assignment);
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});
