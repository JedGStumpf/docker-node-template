/**
 * Event request routes — Sprint 1.
 *
 * GET  /api/requests/availability — check zip+topic coverage
 * POST /api/requests — submit a new event request
 * GET  /api/requests/:id — get request status
 * POST /api/requests/:id/verify — verify email token
 */
import { Router, Request, Response } from 'express';
import { ServiceError } from '../errors';

export const requestsRouter = Router();

function firstString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

/** GET /api/requests/availability?zip=&classSlug= */
requestsRouter.get('/requests/availability', async (req: Request, res: Response) => {
  try {
    const { zip, classSlug } = req.query;

    if (!zip || typeof zip !== 'string') {
      return res.status(422).json({ error: 'zip is required' });
    }
    if (!classSlug || typeof classSlug !== 'string') {
      return res.status(422).json({ error: 'classSlug is required' });
    }
    if (!/^\d{5}$/.test(zip)) {
      return res.status(422).json({ error: 'zip must be a 5-digit US zip code' });
    }

    const { candidates, error } = await req.services.matching.findMatchingInstructors({
      zip,
      classSlug,
    });

    if (error === 'uncovered_zip') {
      return res.json({ available: false, reason: 'uncovered_zip' });
    }

    if (!candidates || candidates.length === 0) {
      return res.json({ available: false });
    }

    const slots = req.services.matching.aggregateSlots(candidates);
    res.json({ available: true, slots });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

/** POST /api/requests */
requestsRouter.post('/requests', async (req: Request, res: Response) => {
  try {
    const {
      classSlug,
      requesterName,
      requesterEmail,
      groupType,
      expectedHeadcount,
      zipCode,
      preferredDates,
      locationFreeText,
      externalRegistrationUrl,
      siteControl,
      siteReadiness,
      marketingCapability,
    } = req.body;

    // Validate required fields
    const missing: string[] = [];
    if (!classSlug) missing.push('classSlug');
    if (!requesterName) missing.push('requesterName');
    if (!requesterEmail) missing.push('requesterEmail');
    if (!groupType) missing.push('groupType');
    if (!expectedHeadcount) missing.push('expectedHeadcount');
    if (!zipCode) missing.push('zipCode');
    if (!preferredDates || !Array.isArray(preferredDates) || preferredDates.length === 0) {
      missing.push('preferredDates');
    }

    if (missing.length > 0) {
      return res.status(422).json({
        error: 'Missing required fields',
        fields: missing,
      });
    }

    if (!/^\d{5}$/.test(zipCode)) {
      return res.status(422).json({ error: 'zipCode must be a 5-digit US zip code' });
    }

    // Validate classSlug is requestable
    const classRecord = await req.services.content.getClassBySlug(classSlug);
    if (!classRecord) {
      return res.status(422).json({
        error: 'Class not found or not requestable',
        code: 'invalid_class_slug',
      });
    }

    // Check coverage
    const { candidates, error } = await req.services.matching.findCandidatesByTopicAndGeo({
      zip: zipCode,
      classSlug,
    });

    if (error === 'uncovered_zip' || !candidates || candidates.length === 0) {
      return res.status(422).json({
        error: 'No instructors available for this zip code and class',
        code: 'no_coverage',
      });
    }

    // Create the request
    const eventRequest = await req.services.requests.createRequest({
      classSlug,
      requesterName,
      requesterEmail,
      groupType,
      expectedHeadcount: Number(expectedHeadcount),
      zipCode,
      preferredDates,
      locationFreeText,
      externalRegistrationUrl,
      siteControl,
      siteReadiness,
      marketingCapability,
    });

    // Send verification email
    try {
      await req.services.email.sendVerificationEmail({
        to: requesterEmail,
        requestId: eventRequest.id,
        token: eventRequest.verificationToken,
      });
    } catch {
      // Don't fail the request creation if email fails
    }

    res.status(201).json({
      id: eventRequest.id,
      status: eventRequest.status,
    });
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

/** GET /api/requests/:id */
requestsRouter.get('/requests/:id', async (req: Request, res: Response) => {
  try {
    const id = firstString(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'Invalid request id' });
    }
    const eventRequest = await req.services.requests.getRequest(id);
    if (!eventRequest) {
      return res.status(404).json({ error: 'Request not found' });
    }
    res.json(eventRequest);
  } catch (err: any) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/requests/:id/verify */
requestsRouter.post('/requests/:id/verify', async (req: Request, res: Response) => {
  try {
    const id = firstString(req.params.id);
    const token = firstString(req.query.token) || firstString(req.body?.token);

    if (!id || !token) {
      return res.status(400).json({ error: 'Verification token required' });
    }

    const updated = await req.services.requests.verifyRequest(
      id,
      token,
      req.services.matching,
      req.services.email,
    );

    res.json({ status: updated.status });
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});
