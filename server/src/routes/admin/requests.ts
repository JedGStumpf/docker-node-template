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
    const { status, search } = req.query;
    const prisma = req.services.prisma;

    const page = Math.max(1, Number(req.query.page) || 1);
    const rawLimit = Number(req.query.limit) || 20;
    const limit = Math.min(100, Math.max(1, rawLimit));
    const useV2Envelope = !!(req.query.page || req.query.limit || req.query.search);

    // Legacy behavior: without pagination/search, default to new or unverified.
    // V2 behavior: with pagination/search, allow any status value.
    let statusFilter: string | undefined;
    if (typeof status === 'string') {
      if (!useV2Envelope) {
        statusFilter = status === 'unverified' ? 'unverified' : 'new';
      } else {
        statusFilter = status;
      }
    } else if (!useV2Envelope) {
      statusFilter = 'new';
    }

    const where: any = {};
    if (statusFilter) {
      where.status = statusFilter;
    }
    if (typeof search === 'string' && search.trim()) {
      where.OR = [
        { requesterName: { contains: search.trim() } },
        { requesterEmail: { contains: search.trim() } },
      ];
    }

    const [requests, total] = await Promise.all([
      prisma.eventRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        assignments: {
          include: {
            instructor: true,
          },
        },
        site: true,
      },
      ...(useV2Envelope ? { skip: (page - 1) * limit, take: limit } : {}),
    }),
      prisma.eventRequest.count({ where }),
    ]);

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
        registeredSiteId: r.registeredSiteId ?? null,
        emailThreadAddress: r.emailThreadAddress ?? null,
        asanaTaskId: r.asanaTaskId ?? null,
        assignments: assignmentSummary,
      };
    });

    if (!useV2Envelope) {
      return res.json(response);
    }

    return res.json({
      requests: response,
      total,
      page,
      limit,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch requests', detail: err.message });
  }
});

adminRequestsRouter.get('/requests/:id', requirePike13Admin, async (req: Request, res: Response) => {
  try {
    const prisma = req.services.prisma;
    const requestRecord = await prisma.eventRequest.findUnique({
      where: { id: req.params.id },
      include: {
        assignments: {
          include: { instructor: true },
        },
        site: true,
      },
    });

    if (!requestRecord) {
      return res.status(404).json({ error: 'Request not found' });
    }

    return res.json(requestRecord);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch request', detail: err.message });
  }
});

adminRequestsRouter.put('/requests/:id/status', requirePike13Admin, async (req: Request, res: Response) => {
  try {
    const rawStatus = String(req.body?.status || '').trim();
    const mappedStatus = rawStatus === 'scheduled' ? 'dates_proposed' : rawStatus;

    if (!mappedStatus) {
      return res.status(400).json({ error: 'status is required' });
    }

    const transitionData: any = {};
    if (req.body?.proposedDates) transitionData.proposedDates = req.body.proposedDates;
    if (req.body?.minHeadcount != null) transitionData.minHeadcount = req.body.minHeadcount;
    if (req.body?.votingDeadline) transitionData.votingDeadline = req.body.votingDeadline;

    const updated = await req.services.requests.transitionStatus(
      req.params.id,
      mappedStatus,
      Object.keys(transitionData).length > 0 ? transitionData : undefined,
    );
    return res.json(updated);
  } catch (err: any) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Failed to update request status', detail: err.message });
  }
});
