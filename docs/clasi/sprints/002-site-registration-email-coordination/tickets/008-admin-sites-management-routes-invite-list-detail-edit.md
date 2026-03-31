---
id: "008"
title: "Admin sites management routes — invite, list, detail, edit"
status: todo
use-cases: [SUC-001, SUC-007]
depends-on: ["002"]
github-issue: ""
todo: ""
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Admin sites management routes — invite, list, detail, edit

## Description

Add four admin-only routes to `server/src/routes/admin.ts` (or a new `server/src/routes/admin-sites.ts`), all protected by `requireAdmin`.

**`POST /api/admin/sites/invite`**
- Body: `{ contactEmail, contactName }`
- Calls `SiteService.createInvitation(contactEmail, contactName)` to create `SiteInvitation`
- Calls `EmailService.sendSiteInvitation(contactEmail, contactName, inviteUrl)` where `inviteUrl = {BASE_URL}/site-reg/{token}`
- 201 on success with `{ invitationId, token }` (token returned for admin convenience — can be linked directly)
- 409 if a pending (unexpired, unused) invitation already exists for that email

**`GET /api/admin/sites`**
- Returns all `RegisteredSite` records with rep info: `[{ id, name, address, zipCode, active, rep: { id, email, displayName } | null }]`
- Includes both active and inactive sites

**`GET /api/admin/sites/:id`**
- Full site detail including rep and any pending invitations

**`PUT /api/admin/sites/:id`**
- Update site fields (same fields as `PUT /api/site-rep/profile`) + `active` flag
- 200 with updated site; 404 if not found

## Acceptance Criteria

- [ ] `POST /api/admin/sites/invite` creates invitation and sends email, returns 201
- [ ] `POST /api/admin/sites/invite` returns 409 when unexpired invitation already exists for email
- [ ] `GET /api/admin/sites` returns all sites (active + inactive) with rep info
- [ ] `GET /api/admin/sites/:id` returns full site detail
- [ ] `PUT /api/admin/sites/:id` updates site including `active` flag
- [ ] All four routes require admin session; return 401/403 otherwise

## Testing

- **Existing tests to run**: `npm run test:server`
- **New tests to write**: `tests/server/admin-sites.test.ts` — send invite (happy path + duplicate), list, get detail, edit, auth guard tests
- **Verification command**: `npm run test:server`
