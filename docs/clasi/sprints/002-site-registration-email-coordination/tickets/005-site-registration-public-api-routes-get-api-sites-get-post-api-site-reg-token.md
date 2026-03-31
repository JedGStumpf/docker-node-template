---
id: "005"
title: "Site registration public API routes — GET /api/sites, GET/POST /api/site-reg/:token"
status: todo
use-cases: [SUC-001, SUC-002, SUC-003]
depends-on: ["002"]
github-issue: ""
todo: ""
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Site registration public API routes — GET /api/sites, GET/POST /api/site-reg/:token

## Description

Add three unauthenticated public routes to support the site picker on the intake form and the site registration flow.

**`GET /api/sites`**
- Returns array of active `RegisteredSite` records: `[{ id, name, address, city, state, zipCode }]`
- No auth required — used by intake form autocomplete
- Responds 200 with empty array if no sites registered yet

**`GET /api/site-reg/:token`**
- Validates the invitation token via `SiteService.getInvitationByToken`
- 404 if token not found; 410 if expired or already used
- 200 with `{ contactEmail, contactName }` for form pre-fill

**`POST /api/site-reg/:token`**
- Accepts: `{ siteName, address, city, state, zipCode, capacity?, roomNotes?, repDisplayName }`
- Validates token (404/410 on failure)
- Calls `SiteService.registerSite(token, siteData, repData)`
- 201 on success with `{ registeredSiteId, siteRepId }`
- 409 if the contact email already has a `SiteRep` account

Create `server/src/routes/sites.ts` and `server/src/routes/site-registration.ts`, registered in `app.ts`.

## Acceptance Criteria

- [ ] `GET /api/sites` returns 200 with array of active sites (empty array when none)
- [ ] `GET /api/site-reg/:token` returns 200 with pre-fill data for valid token
- [ ] `GET /api/site-reg/:token` returns 404 for unknown token, 410 for expired/used token
- [ ] `POST /api/site-reg/:token` creates `RegisteredSite` + `SiteRep`, marks invitation used, returns 201
- [ ] `POST /api/site-reg/:token` returns 409 if email already registered as `SiteRep`
- [ ] All routes are unauthenticated (no session required)
- [ ] Input validated — missing required fields return 400

## Testing

- **Existing tests to run**: `npm run test:server`
- **New tests to write**: `tests/server/site-registration.test.ts` — happy path registration flow, token not found, token expired, duplicate email
- **Verification command**: `npm run test:server`
