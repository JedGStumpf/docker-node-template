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

    // Sprint 5: include latest email extraction
    const latestExtraction = await req.services.emailExtraction.getLatestExtraction(req.params.id);

    return res.json({ ...requestRecord, latestExtraction: latestExtraction || null });
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
      req.services.email,
    );
    return res.json(updated);
  } catch (err: any) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Failed to update request status', detail: err.message });
  }
});

/** PUT /api/admin/requests/:id — Update event configuration fields */
adminRequestsRouter.put('/requests/:id', requirePike13Admin, async (req: Request, res: Response) => {
  try {
    const requestRecord = await req.services.requests.getRequest(req.params.id);
    if (!requestRecord) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const updateData: Record<string, any> = {};

    // minHeadcount
    if (req.body?.minHeadcount != null) {
      const mc = Number(req.body.minHeadcount);
      if (!Number.isInteger(mc) || mc < 1) {
        return res.status(400).json({ error: 'minHeadcount must be an integer ≥ 1' });
      }
      updateData.minHeadcount = mc;
    }

    // votingDeadline
    if (req.body?.votingDeadline) {
      const deadline = new Date(req.body.votingDeadline);
      if (isNaN(deadline.getTime()) || deadline <= new Date()) {
        return res.status(400).json({ error: 'votingDeadline must be a valid future date' });
      }
      updateData.votingDeadline = deadline;
    }

    // eventType
    if (req.body?.eventType) {
      if (!['private', 'public'].includes(req.body.eventType)) {
        return res.status(400).json({ error: 'eventType must be "private" or "public"' });
      }
      updateData.eventType = req.body.eventType;
    }

    // proposedDates — only allowed when status is discussing or dates_proposed
    if (req.body?.proposedDates) {
      if (!['discussing', 'dates_proposed'].includes(requestRecord.status)) {
        return res.status(422).json({ error: 'proposedDates can only be updated in discussing or dates_proposed status' });
      }
      if (!Array.isArray(req.body.proposedDates) || req.body.proposedDates.length === 0) {
        return res.status(400).json({ error: 'proposedDates must be a non-empty array' });
      }
      updateData.proposedDates = req.body.proposedDates;
    }

    // eventCapacity (positive integer or null)
    if (req.body?.eventCapacity !== undefined) {
      if (req.body.eventCapacity === null) {
        updateData.eventCapacity = null;
      } else {
        const cap = Number(req.body.eventCapacity);
        if (!Number.isInteger(cap) || cap < 1) {
          return res.status(422).json({ error: 'eventCapacity must be a positive integer or null' });
        }
        updateData.eventCapacity = cap;
      }
    }

    // giveLivelyUrl (optional HTTPS URL or null to clear)
    if (req.body?.giveLivelyUrl !== undefined) {
      if (req.body.giveLivelyUrl === null || req.body.giveLivelyUrl === '') {
        updateData.giveLivelyUrl = null;
      } else {
        const url = String(req.body.giveLivelyUrl).trim();
        if (!url.startsWith('https://')) {
          return res.status(400).json({ error: 'giveLivelyUrl must start with https://' });
        }
        updateData.giveLivelyUrl = url;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const updated = await req.services.prisma.eventRequest.update({
      where: { id: req.params.id },
      data: updateData,
      include: { site: true },
    });

    return res.json(updated);
  } catch (err: any) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Failed to update request', detail: err.message });
  }
});

/** POST /api/admin/requests/:id/apply-extraction/:extractionId — Apply AI extraction signal */
adminRequestsRouter.post(
  '/requests/:id/apply-extraction/:extractionId',
  requirePike13Admin,
  async (req: Request, res: Response) => {
    try {
      const adminEmail = (req.session as any)?.pike13Email || 'admin';
      const result = await req.services.emailExtraction.applyExtraction(
        req.params.extractionId,
        adminEmail,
      );
      return res.json(result);
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        return res.status(404).json({ error: err.message });
      }
      if (err.message?.includes('no applicable')) {
        return res.status(422).json({ error: err.message });
      }
      return res.status(500).json({ error: 'Failed to apply extraction', detail: err.message });
    }
  },
);

/** POST /api/admin/requests/:id/reopen-matching — Re-open instructor matching for no_instructor requests */
adminRequestsRouter.post('/requests/:id/reopen-matching', requirePike13Admin, async (req: Request, res: Response) => {
  try {
    const prisma = req.services.prisma;
    const requestRecord = await prisma.eventRequest.findUnique({ where: { id: req.params.id } });
    if (!requestRecord) {
      return res.status(404).json({ error: 'Request not found' });
    }
    if (requestRecord.status !== 'no_instructor') {
      return res.status(422).json({ error: 'Request must be in no_instructor status to reopen matching' });
    }

    // Reset status to discussing
    const updated = await prisma.eventRequest.update({
      where: { id: req.params.id },
      data: { status: 'discussing' },
    });

    // Re-run instructor matching
    try {
      const { candidates } = await req.services.matching.findMatchingInstructors({
        zip: requestRecord.zipCode,
        classSlug: requestRecord.classSlug,
        excludeInstructorIds: [],
      });
      if (candidates && candidates.length > 0) {
        const notificationToken = crypto.randomUUID();
        const assignmentTimeoutHours = Number(process.env.ASSIGNMENT_TIMEOUT_HOURS) || 48;
        const newAssignment = await prisma.instructorAssignment.create({
          data: {
            requestId: requestRecord.id,
            instructorId: candidates[0].instructorId,
            status: 'pending',
            notificationToken,
            notifiedAt: new Date(),
            timeoutAt: new Date(Date.now() + assignmentTimeoutHours * 3600_000),
          },
        });
        const instructor = await prisma.instructorProfile.findUnique({
          where: { id: candidates[0].instructorId },
        });
        if (instructor) {
          await req.services.email.sendMatchNotification({
            to: instructor.email,
            assignmentId: newAssignment.id,
            notificationToken,
            requestId: requestRecord.id,
            classTitle: requestRecord.classSlug,
            requesterName: requestRecord.requesterName,
            zipCode: requestRecord.zipCode,
            preferredDates: Array.isArray(requestRecord.preferredDates) ? requestRecord.preferredDates : [],
            replyTo: requestRecord.emailThreadAddress || undefined,
          });
        }
      }
    } catch {
      // Don't fail the status reset if re-matching fails
    }

    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to reopen matching', detail: err.message });
  }
});

/** POST /api/admin/requests/:id/registrations — Admin manually adds a registration */
adminRequestsRouter.post('/requests/:id/registrations', requirePike13Admin, async (req: Request, res: Response) => {
  try {
    const prisma = req.services.prisma;
    const requestRecord = await prisma.eventRequest.findUnique({ where: { id: req.params.id } });
    if (!requestRecord) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const { attendeeName, attendeeEmail, numberOfKids } = req.body || {};
    if (!attendeeName || !attendeeEmail || numberOfKids == null) {
      return res.status(400).json({ error: 'attendeeName, attendeeEmail, and numberOfKids are required' });
    }
    if (!Number.isInteger(Number(numberOfKids)) || Number(numberOfKids) < 1) {
      return res.status(400).json({ error: 'numberOfKids must be a positive integer' });
    }

    // Determine registration status
    let registrationStatus = 'interested';
    if (requestRecord.status === 'confirmed') {
      registrationStatus = 'confirmed';
      if (requestRecord.eventCapacity != null) {
        const confirmedCount = await prisma.registration.count({
          where: { requestId: req.params.id, status: 'confirmed' },
        });
        if (confirmedCount >= requestRecord.eventCapacity) {
          registrationStatus = 'waitlisted';
        }
      }
    }

    const registration = await prisma.registration.create({
      data: {
        requestId: req.params.id,
        attendeeName: String(attendeeName),
        attendeeEmail: String(attendeeEmail),
        numberOfKids: Number(numberOfKids),
        availableDates: [],
        status: registrationStatus,
      },
    });

    return res.status(201).json(registration);
  } catch (err: any) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'A registration with this email already exists' });
    }
    return res.status(500).json({ error: 'Failed to create registration', detail: err.message });
  }
});

/** POST /api/admin/requests/:id/finalize-date — Manually finalize a date */
adminRequestsRouter.post('/requests/:id/finalize-date', requirePike13Admin, async (req: Request, res: Response) => {
  try {
    const { date } = req.body || {};
    if (!date || typeof date !== 'string') {
      return res.status(400).json({ error: 'date is required' });
    }

    const requestRecord = await req.services.requests.getRequest(req.params.id);
    if (!requestRecord) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (requestRecord.status !== 'dates_proposed') {
      return res.status(422).json({ error: 'Request must be in dates_proposed status to finalize' });
    }

    const proposedDates: string[] = Array.isArray(requestRecord.proposedDates)
      ? requestRecord.proposedDates
      : [];
    if (!proposedDates.includes(date)) {
      return res.status(422).json({ error: 'Date is not one of the proposed dates' });
    }

    const result = await req.services.registration.finalizeDate(
      req.params.id,
      date,
      req.services.requests,
      req.services.email,
    );

    return res.json(result);
  } catch (err: any) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Failed to finalize date', detail: err.message });
  }
});

/** GET /api/admin/requests/:id/email-thread — Return unified thread view (sent + received) */
adminRequestsRouter.get('/requests/:id/email-thread', requirePike13Admin, async (req: Request, res: Response) => {
  try {
    const prisma = req.services.prisma;
    const { id } = req.params;

    const requestRecord = await prisma.eventRequest.findUnique({ where: { id } });
    if (!requestRecord) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const [sent, received] = await Promise.all([
      prisma.emailQueue.findMany({ where: { requestId: id }, orderBy: { createdAt: 'asc' } }),
      prisma.emailExtraction.findMany({ where: { requestId: id }, orderBy: { createdAt: 'asc' } }),
    ]);

    return res.json({ sent, received });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch email thread', detail: err.message });
  }
});

/** POST /api/admin/requests/:id/email-requester — Queue an outbound email to the requester */
adminRequestsRouter.post('/requests/:id/email-requester', requirePike13Admin, async (req: Request, res: Response) => {
  try {
    const { subject, body } = req.body || {};
    if (!subject) {
      return res.status(400).json({ error: 'subject is required' });
    }
    if (!body) {
      return res.status(400).json({ error: 'body is required' });
    }

    const prisma = req.services.prisma;
    const requestRecord = await prisma.eventRequest.findUnique({ where: { id: req.params.id } });
    if (!requestRecord) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (!requestRecord.emailThreadAddress) {
      return res.status(422).json({ error: 'no_thread_address' });
    }

    await req.services.emailQueue.enqueue({
      to: requestRecord.requesterEmail,
      subject,
      text: body,
      replyTo: requestRecord.emailThreadAddress,
      requestId: requestRecord.id,
    });

    return res.status(201).json({ queued: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to queue email', detail: err.message });
  }
});
