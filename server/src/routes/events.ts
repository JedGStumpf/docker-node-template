/**
 * Public event routes — event info, registration, and registrations list.
 * Ticket 005, Sprint 003.
 *
 * GET  /api/events/:requestId         — Public event info (token-gated)
 * POST /api/events/:requestId/register — Register for a private event
 * GET  /api/events/:requestId/registrations — Admin/instructor only
 */
import { Router, Request, Response } from 'express';
import { ServiceError } from '../errors';
import { requireInstructor } from '../middleware/requirePike13';

export const eventsRouter = Router();

/** GET /api/events/:requestId?token=... — Public event info */
eventsRouter.get('/events/:requestId', async (req: Request, res: Response) => {
  try {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (!token) {
      return res.status(401).json({ error: 'Registration token is required' });
    }

    const info = await req.services.registration.getEventInfo(req.params.requestId, token);

    // Enrich with class details from content.json
    let classDetails: any = null;
    try {
      const classes = await req.services.content.getClasses();
      classDetails = classes.find((c: any) => c.slug === info.classSlug) || null;
    } catch { /* content service may not have data */ }

    return res.json({
      ...info,
      className: classDetails?.title || info.classSlug,
      classDescription: classDetails?.description || null,
    });
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Failed to fetch event info', detail: err.message });
  }
});

/** POST /api/events/:requestId/register — Register for a private event */
eventsRouter.post('/events/:requestId/register', async (req: Request, res: Response) => {
  try {
    const { token, attendeeName, attendeeEmail, numberOfKids, availableDates } = req.body || {};

    // Input validation
    if (!token || typeof token !== 'string') {
      return res.status(401).json({ error: 'Registration token is required' });
    }
    if (!attendeeName || typeof attendeeName !== 'string' || attendeeName.trim().length === 0) {
      return res.status(400).json({ error: 'attendeeName is required' });
    }
    if (attendeeName.length > 200) {
      return res.status(400).json({ error: 'attendeeName must be 200 characters or less' });
    }
    if (!attendeeEmail || typeof attendeeEmail !== 'string' || !attendeeEmail.includes('@')) {
      return res.status(400).json({ error: 'A valid attendeeEmail is required' });
    }
    if (!numberOfKids || typeof numberOfKids !== 'number' || numberOfKids < 1 || !Number.isInteger(numberOfKids)) {
      return res.status(400).json({ error: 'numberOfKids must be an integer ≥ 1' });
    }
    if (!Array.isArray(availableDates)) {
      return res.status(400).json({ error: 'availableDates must be an array' });
    }

    const registration = await req.services.registration.createRegistration(
      req.params.requestId,
      { attendeeName: attendeeName.trim(), attendeeEmail: attendeeEmail.trim(), numberOfKids, availableDates },
      token,
    );

    return res.status(201).json(registration);
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Failed to register', detail: err.message });
  }
});

/** GET /api/events/:requestId/registrations — Admin/instructor only */
eventsRouter.get('/events/:requestId/registrations', requireInstructor, async (req: Request, res: Response) => {
  try {
    const result = await req.services.registration.listRegistrations(req.params.requestId);
    return res.json(result);
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Failed to list registrations', detail: err.message });
  }
});

/** POST /api/events/:requestId/registrations/:id/cancel — Cancel a registration */
eventsRouter.post('/events/:requestId/registrations/:id/cancel', async (req: Request, res: Response) => {
  try {
    const { token } = req.body || {};

    if (!token || typeof token !== 'string') {
      return res.status(401).json({ error: 'Registration token is required' });
    }

    // Verify the registration token matches the request
    const request = await req.services.prisma.eventRequest.findUnique({
      where: { id: req.params.requestId },
    });
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    if (request.registrationToken !== token) {
      return res.status(401).json({ error: 'Invalid registration token' });
    }

    // Verify the registration belongs to this request
    const registration = await req.services.prisma.registration.findUnique({
      where: { id: req.params.id },
    });
    if (!registration || registration.requestId !== req.params.requestId) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    const updated = await req.services.registration.cancelRegistration(
      req.params.id,
      req.services.email,
    );

    return res.json(updated);
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Failed to cancel registration', detail: err.message });
  }
});
