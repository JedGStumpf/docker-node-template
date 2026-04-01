import { Router, Request, Response } from 'express';
import { ConflictError } from '../../errors';

export const adminSitesRouter = Router();

function firstString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

adminSitesRouter.post('/sites/invite', async (req: Request, res: Response) => {
  try {
    const contactEmail = firstString(req.body?.contactEmail);
    const contactName = firstString(req.body?.contactName);

    if (!contactEmail || !contactName) {
      return res.status(400).json({ error: 'contactEmail and contactName are required' });
    }

    const token = await req.services.sites.createInvitation(contactEmail, contactName);
    const invitation = await req.services.sites.getInvitationRaw(token);

    const base = process.env.APP_BASE_URL || 'http://localhost:3000';
    const inviteUrl = `${base}/site-reg/${token}`;
    await req.services.email.sendSiteInvitation(contactEmail, contactName, inviteUrl);

    return res.status(201).json({
      invitationId: invitation?.id,
      token,
    });
  } catch (err: any) {
    if (err instanceof ConflictError) {
      return res.status(409).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

adminSitesRouter.get('/sites', async (req: Request, res: Response) => {
  try {
    const sites = await req.services.sites.adminListSites();
    const response = sites.map((s: any) => ({
      id: s.id,
      name: s.name,
      address: s.address,
      city: s.city,
      state: s.state,
      zipCode: s.zipCode,
      active: s.active,
      rep: s.reps?.[0]
        ? {
          id: s.reps[0].id,
          email: s.reps[0].email,
          displayName: s.reps[0].displayName,
        }
        : null,
    }));

    return res.json(response);
  } catch (err: any) {
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

adminSitesRouter.get('/sites/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid site id' });

    const site = await req.services.sites.getSiteDetail(id);
    if (!site) return res.status(404).json({ error: 'Site not found' });

    return res.json(site);
  } catch (err: any) {
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

adminSitesRouter.put('/sites/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid site id' });

    const updates: Record<string, unknown> = {};
    const allowed = ['name', 'address', 'city', 'state', 'zipCode', 'capacity', 'roomNotes', 'active'];
    for (const field of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) {
        updates[field] = req.body[field];
      }
    }

    try {
      const site = await req.services.sites.updateSite(id, updates);
      return res.json(site);
    } catch {
      return res.status(404).json({ error: 'Site not found' });
    }
  } catch (err: any) {
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});
