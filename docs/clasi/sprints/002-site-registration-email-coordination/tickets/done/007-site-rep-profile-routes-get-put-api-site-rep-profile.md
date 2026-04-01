---
id: "007"
title: "Site rep profile routes — GET/PUT /api/site-rep/profile"
status: done
use-cases: [SUC-002, SUC-003]
depends-on: ["006"]
github-issue: ""
todo: ""
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Site rep profile routes — GET/PUT /api/site-rep/profile

## Description

Add a `site-rep` router at `server/src/routes/site-rep.ts` with two routes, both protected by `requireSiteRep`.

**`GET /api/site-rep/profile`**
- Returns the authenticated site rep's profile and their linked `RegisteredSite` details
- Response: `{ siteRep: { id, email, displayName }, site: { id, name, address, city, state, zipCode, capacity, roomNotes, active } }`

**`PUT /api/site-rep/profile`**
- Allows site rep to update their own site's details: `{ name?, address?, city?, state?, zipCode?, capacity?, roomNotes? }`
- Calls `SiteService.updateSite(siteRepId's registeredSiteId, data)`
- 200 with updated site on success

Register the router in `app.ts` at `/api/site-rep`.

## Acceptance Criteria

- [ ] `GET /api/site-rep/profile` returns 200 with rep + site data for authenticated site rep
- [ ] `GET /api/site-rep/profile` returns 401 for unauthenticated requests
- [ ] `GET /api/site-rep/profile` returns 403 for non-site-rep sessions (e.g. admin, instructor)
- [ ] `PUT /api/site-rep/profile` updates site fields and returns 200 with updated site
- [ ] `PUT /api/site-rep/profile` ignores unknown fields (no 400 on extra props)

## Testing

- **Existing tests to run**: `npm run test:server`
- **New tests to write**: Part of `tests/server/site-rep-auth.test.ts` — get profile after login, update site fields, verify auth guards reject unauthenticated/wrong-role requests
- **Verification command**: `npm run test:server`
