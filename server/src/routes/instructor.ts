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
import { requireAdmin } from '../middleware/requireAdmin';
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

/** GET /api/instructor/events — instructor's upcoming and past assignments */
instructorRouter.get('/instructor/events', requireInstructor, async (req: Request, res: Response) => {
  try {
    const pike13UserId = (req.session as any).pike13UserId as string;
    const instructor = await req.services.prisma.instructorProfile.findUnique({
      where: { pike13UserId },
    });
    if (!instructor) {
      return res.status(404).json({ error: 'Instructor profile not found' });
    }

    const now = new Date();
    const twelveMonthsAgo = new Date(now.getTime() - 365 * 24 * 3600 * 1000);

    const assignments = await req.services.prisma.instructorAssignment.findMany({
      where: {
        instructorId: instructor.id,
        status: { in: ['accepted', 'pending'] },
      },
      include: {
        request: {
          select: {
            id: true,
            classSlug: true,
            confirmedDate: true,
            locationFreeText: true,
            status: true,
            zipCode: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const upcoming = assignments
      .filter((a: any) => {
        const date = a.request.confirmedDate ? new Date(a.request.confirmedDate) : null;
        return date && date >= now;
      })
      .sort((a: any, b: any) => {
        const da = new Date(a.request.confirmedDate).getTime();
        const db = new Date(b.request.confirmedDate).getTime();
        return da - db;
      });

    const past = assignments
      .filter((a: any) => {
        const date = a.request.confirmedDate ? new Date(a.request.confirmedDate) : null;
        return date && date < now && date >= twelveMonthsAgo;
      })
      .sort((a: any, b: any) => {
        const da = new Date(a.request.confirmedDate).getTime();
        const db = new Date(b.request.confirmedDate).getTime();
        return db - da;
      });

    const mapAssignment = (a: any) => ({
      id: a.id,
      requestId: a.request.id,
      classSlug: a.request.classSlug,
      confirmedDate: a.request.confirmedDate,
      location: a.request.locationFreeText || a.request.zipCode,
      requestStatus: a.request.status,
      assignmentStatus: a.status,
      equipmentStatus: a.equipmentStatus,
      equipmentCheckedAt: a.equipmentCheckedAt,
    });

    res.json({
      upcoming: upcoming.map(mapAssignment),
      past: past.map(mapAssignment),
    });
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** GET /api/assignments/:id/equipment-status */
instructorRouter.get('/assignments/:id/equipment-status', requireInstructor, async (req: Request, res: Response) => {
  try {
    const assignmentId = firstString(req.params.id);
    if (!assignmentId) return res.status(400).json({ error: 'Missing assignment id' });

    const pike13UserId = (req.session as any).pike13UserId as string;
    const pike13Role = (req.session as any).pike13Role as string;

    // Load assignment to check ownership
    const assignment = await req.services.prisma.instructorAssignment.findUnique({
      where: { id: assignmentId },
      include: { instructor: true },
    });

    if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

    // Instructors can only see their own assignments; admins see all
    if (pike13Role !== 'admin' && assignment.instructor.pike13UserId !== pike13UserId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const status = await req.services.equipment.getEquipmentStatus(assignmentId);
    if (!status) return res.status(404).json({ error: 'Assignment not found' });

    res.json(status);
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/assignments/:id/equipment-status/override (admin only) */
instructorRouter.post('/assignments/:id/equipment-status/override', requireAdmin, async (req: Request, res: Response) => {
  try {
    const assignmentId = firstString(req.params.id);
    if (!assignmentId) return res.status(400).json({ error: 'Missing assignment id' });

    const { status, note } = req.body;
    if (!status || !['ready', 'unknown'].includes(status)) {
      return res.status(400).json({ error: 'status must be "ready" or "unknown"' });
    }

    const assignment = await req.services.prisma.instructorAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

    const overriddenAt = new Date();
    const adminIdentity = (req.user as any)?.email || (req.session as any)?.pike13Email || 'admin';

    const updated = await req.services.prisma.instructorAssignment.update({
      where: { id: assignmentId },
      data: {
        equipmentStatus: status,
        equipmentCheckedAt: overriddenAt,
      },
    });

    console.log(
      `EquipmentStatus override: assignment ${assignmentId} → ${status} by ${adminIdentity}${note ? ` (note: ${note})` : ''}`,
    );

    res.json({
      id: updated.id,
      equipmentStatus: updated.equipmentStatus,
      overriddenAt,
      overriddenBy: adminIdentity,
    });
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
