---
id: "006"
title: "Magic-link authentication routes for site reps"
status: done
use-cases: [SUC-002]
depends-on: ["002"]
github-issue: ""
todo: ""
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Magic-link authentication routes for site reps

## Description

Add two new routes to the auth router that implement the magic-link login flow for `SiteRep` users.

**`POST /api/auth/magic-link/request`**
- Body: `{ email }`
- Looks up `SiteRep` by email via `SiteService.createMagicLink(email)`
- **Always responds 200** (do not reveal whether the email exists — prevent enumeration)
- When `SiteRep` found: sends magic-link email via `EmailService.sendMagicLink(email, url)`. URL format: `{BASE_URL}/site-rep/login?token={rawToken}`
- When not found: no email sent, same 200 response

**`POST /api/auth/magic-link/verify`**
- Body: `{ token }`
- Calls `SiteService.verifyMagicLink(rawToken)`
- On success: create session with role `SITE_REP`, `userId = siteRep.id`; respond 200 with `{ siteRepId, email, displayName }`
- On failure (token not found, expired, already used): respond 401

Add `SITE_REP` to the session role union type and ensure session creation works exactly as it does for `INSTRUCTOR` sessions. Add `requireSiteRep` middleware guard alongside `requireAuth`/`requireAdmin`.

## Acceptance Criteria

- [ ] `POST /api/auth/magic-link/request` always returns 200 regardless of whether email is registered
- [ ] Magic-link email is sent only when `SiteRep` exists
- [ ] `POST /api/auth/magic-link/verify` returns 200 and creates a session on valid token
- [ ] `POST /api/auth/magic-link/verify` returns 401 on expired, used, or unknown token
- [ ] Token is single-use: second verify attempt on same token returns 401
- [ ] Session `role` is `SITE_REP` after successful verify
- [ ] `requireSiteRep` middleware rejects non-site-rep sessions with 403

## Testing

- **Existing tests to run**: `npm run test:server` (auth tests must still pass)
- **New tests to write**: `tests/server/site-rep-auth.test.ts` — request magic-link (found/not found emails), verify valid token, verify expired token, verify used token (replay prevention)
- **Verification command**: `npm run test:server`
