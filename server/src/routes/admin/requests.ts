/**
 * Admin requests view — Sprint 1.
 * GET /api/admin/requests — list event requests (new and unverified).
 * Requires Pike13 admin session.
 */
import { Router, Request, Response } from 'express';
import { requirePike13Admin } from '../../middleware/requirePike13';

export const adminRequestsRouter = Router();

adminRequestsRouter.get('/requests', requirePike13Admin, async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    const prisma = req.services.prisma;

    // Default to 'new'; allow ?status=unverified
    const statusFilter = (status === 'unverified') ? 'unverified' : 'new';

    const requests = await prisma.eventRequest.findMany({
      where: { status: statusFilter },
      orderBy: { createdAt: 'desc' },
      include: { assignments: true },
    });

    const response = requests.map((r: any) => {
      const preferredDates = Array.isArray(r.preferredDates) ? r.preferredDates : [];
      const assignments = r.assignments || [];
      const assignmentSummary = {
        pending: assignments.filter((a: any) => a.status === 'pending').length,
        accepted: assignments.filter((a: any) => a.status === 'accepted').length,
        declined: assignments.filter((a: any) => a.status === 'declined').length,
        timed_out: assignments.filter((a: any) => a.status === 'timed_out').length,
      };

      return {
        id: r.id,
        classSlug: r.classSlug,
        requesterName: r.requesterName,
        requesterEmail: r.requesterEmail,
        groupType: r.groupType,
        zipCode: r.zipCode,
        expectedHeadcount: r.expectedHeadcount,
        status: r.status,
        createdAt: r.createdAt,
        preferredDates,
        assignments: assignmentSummary,
      };
    });

    res.json(response);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch requests', detail: err.message });
  }
});
