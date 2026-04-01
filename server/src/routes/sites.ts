import { Router, Request, Response } from 'express';

export const sitesRouter = Router();

sitesRouter.get('/sites', async (req: Request, res: Response) => {
  try {
    const sites = await req.services.sites.listSites();
    return res.json(sites);
  } catch (err: any) {
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});
