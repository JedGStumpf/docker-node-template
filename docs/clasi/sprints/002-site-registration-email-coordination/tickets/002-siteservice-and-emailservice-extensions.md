---
id: "002"
title: "SiteService and EmailService extensions"
status: todo
use-cases: [SUC-001, SUC-002, SUC-003]
depends-on: ["001"]
github-issue: ""
todo: ""
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# SiteService and EmailService extensions

## Description

Create `server/src/services/site.service.ts` implementing `SiteService`, and extend `EmailService` with three new methods plus optional `replyTo` on all existing notification methods.

**`SiteService` methods:**
- `createInvitation(contactEmail, contactName)` — create `SiteInvitation` (UUID token, 7-day expiry), return token
- `getInvitationByToken(token)` — return invitation if valid (not expired, not used)
- `registerSite(token, siteData, repData)` — create `RegisteredSite` + `SiteRep`, mark invitation used; auto-populate lat/lng from zip centroid data if ZIP matches
- `listSites()` — return active sites (for public autocomplete endpoint)
- `adminListSites()` — return all sites with rep info (for admin panel)
- `getSiteDetail(id)` — site + rep detail
- `updateSite(id, data)` — update site fields
- `createMagicLink(email)` — find `SiteRep` by email, create `SiteRepSession` (raw UUID → SHA-256 hash stored, 24h TTL from `MAGIC_LINK_TTL_MINUTES` env or default 1440), return raw token
- `verifyMagicLink(rawToken)` — hash input, find matching non-expired non-used session, mark used, return `SiteRep`

Register `SiteService` on `ServiceRegistry` as `services.sites`.

**`EmailService` extensions:**
- `sendSiteInvitation(email, name, inviteUrl)` — invitation email
- `sendMagicLink(email, magicUrl)` — magic-link login email
- `sendSiteRepNotification(siteRep, request, replyTo?)` — notify site rep of new matched request
- Add optional `replyTo?: string` parameter to `sendAdminNewRequestNotification`, `sendMatchNotification`, `sendMatchReminder` — when provided, set `Reply-To` header on the email

## Acceptance Criteria

- [ ] `SiteService` exists at `server/src/services/site.service.ts` with all methods listed above
- [ ] `ServiceRegistry` exposes `services.sites` (instance of `SiteService`)
- [ ] `createMagicLink` stores SHA-256 hash (not raw token) in `SiteRepSession.tokenHash`
- [ ] `verifyMagicLink` hashes the raw input before lookup; marks session used after first verification
- [ ] `registerSite` auto-populates lat/lng from zip centroid data when ZIP matches
- [ ] `EmailService` has three new methods: `sendSiteInvitation`, `sendMagicLink`, `sendSiteRepNotification`
- [ ] All existing `EmailService` notification methods accept optional `replyTo` param without breaking existing callers
- [ ] TypeScript compiles with no errors (`npm run build` or `tsc --noEmit`)

## Testing

- **Existing tests to run**: `npm run test:server`
- **New tests to write**: `tests/server/site-registration.test.ts` — unit tests covering `SiteService` methods (invitation CRUD, registerSite, magic-link issue/verify including expiry and replay prevention)
- **Verification command**: `npm run test:server`
