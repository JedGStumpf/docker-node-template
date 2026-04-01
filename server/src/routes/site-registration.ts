import { Router, Request, Response } from 'express';
import { ConflictError } from '../errors';

export const siteRegistrationRouter = Router();

function firstString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

siteRegistrationRouter.get('/site-reg/:token', async (req: Request, res: Response) => {
  try {
    const token = firstString(req.params.token);
    if (!token) return res.status(400).json({ error: 'token is required' });

    const invitationRaw = await req.services.sites.getInvitationRaw(token);
    if (!invitationRaw) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    const invitation = await req.services.sites.getInvitationByToken(token);
    if (!invitation) {
      return res.status(410).json({ error: 'Invitation expired or already used' });
    }

    return res.json({
      contactEmail: invitation.contactEmail,
      contactName: invitation.contactName,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

siteRegistrationRouter.post('/site-reg/:token', async (req: Request, res: Response) => {
  try {
    const token = firstString(req.params.token);
    if (!token) return res.status(400).json({ error: 'token is required' });

    const {
      siteName,
      address,
      city,
      state,
      zipCode,
      capacity,
      roomNotes,
      repDisplayName,
    } = req.body || {};

    const missing: string[] = [];
    if (!siteName) missing.push('siteName');
    if (!address) missing.push('address');
    if (!city) missing.push('city');
    if (!state) missing.push('state');
    if (!zipCode) missing.push('zipCode');
    if (!repDisplayName) missing.push('repDisplayName');

    if (missing.length > 0) {
      return res.status(400).json({ error: 'Missing required fields', fields: missing });
    }

    const invitationRaw = await req.services.sites.getInvitationRaw(token);
    if (!invitationRaw) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    const invitation = await req.services.sites.getInvitationByToken(token);
    if (!invitation) {
      return res.status(410).json({ error: 'Invitation expired or already used' });
    }

    const { site, rep } = await req.services.sites.registerSite(
      token,
      {
        name: siteName,
        address,
        city,
        state,
        zipCode,
        capacity: typeof capacity === 'number' ? capacity : undefined,
        roomNotes: typeof roomNotes === 'string' ? roomNotes : undefined,
      },
      {
        displayName: repDisplayName,
      },
    );

    return res.status(201).json({
      registeredSiteId: site.id,
      siteRepId: rep.id,
    });
  } catch (err: any) {
    if (err instanceof ConflictError) {
      return res.status(409).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});
