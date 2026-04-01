import { Router, Request, Response } from 'express';
import { requireSiteRep } from '../middleware/requireSiteRep';

export const siteRepRouter = Router();

siteRepRouter.get('/site-rep/profile', requireSiteRep, async (req: Request, res: Response) => {
  try {
    const siteRepId = req.session.siteRepId as number;
    const profile = await req.services.sites.getSiteRepProfile(siteRepId);
    if (!profile) {
      return res.status(404).json({ error: 'Site rep not found' });
    }

    return res.json({
      siteRep: {
        id: profile.id,
        email: profile.email,
        displayName: profile.displayName,
      },
      site: profile.site,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

siteRepRouter.put('/site-rep/profile', requireSiteRep, async (req: Request, res: Response) => {
  try {
    const siteRepId = req.session.siteRepId as number;
    const profile = await req.services.sites.getSiteRepProfile(siteRepId);
    if (!profile) {
      return res.status(404).json({ error: 'Site rep not found' });
    }

    const updates: Record<string, unknown> = {};
    const allowed = ['name', 'address', 'city', 'state', 'zipCode', 'capacity', 'roomNotes'];
    for (const field of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) {
        updates[field] = req.body[field];
      }
    }

    const site = await req.services.sites.updateSite(profile.registeredSiteId, updates);
    return res.json(site);
  } catch (err: any) {
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});
