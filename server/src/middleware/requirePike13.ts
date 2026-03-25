/**
 * Pike13 session-based auth middleware for Sprint 1.
 *
 * Pike13 instructors and admins authenticate via Pike13 OAuth.
 * Their session stores pike13UserId, pike13Role, displayName, email.
 * The test-login endpoint also sets these fields for testing.
 */
import { Request, Response, NextFunction } from 'express';

declare module 'express-session' {
  interface SessionData {
    pike13UserId?: string;
    pike13Role?: 'instructor' | 'admin';
    pike13DisplayName?: string;
    pike13Email?: string;
    pike13AccessToken?: string;
  }
}

/** Requires a Pike13-authenticated session (instructor or admin). Returns 401 if not logged in. */
export function requireInstructor(req: Request, res: Response, next: NextFunction) {
  if (req.session.pike13UserId && req.session.pike13Role) {
    return next();
  }
  return res.status(401).json({ error: 'Authentication required' });
}

/** Requires a Pike13-authenticated session with admin role. Returns 401/403. */
export function requirePike13Admin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.pike13UserId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.session.pike13Role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  return next();
}
