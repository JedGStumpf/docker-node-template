import { Request, Response, NextFunction } from 'express';

declare module 'express-session' {
  interface SessionData {
    siteRepId?: number;
    siteRepEmail?: string;
    siteRepDisplayName?: string;
    role?: 'SITE_REP';
  }
}

export function requireSiteRep(req: Request, res: Response, next: NextFunction) {
  if (!req.session.siteRepId) {
    if (req.user || (req.session as any).isAdmin || (req.session as any).pike13UserId) {
      return res.status(403).json({ error: 'Site rep access required' });
    }
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.session.role !== 'SITE_REP') {
    return res.status(403).json({ error: 'Site rep access required' });
  }
  return next();
}
