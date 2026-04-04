---
id: "006"
title: "Dev experience: seed data, admin nav, requester status page"
status: active
branch: sprint/006-dev-experience-seed-admin-nav-requester-status
use-cases:
  - SUC-001
  - SUC-002
  - SUC-003
  - SUC-004
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Sprint 006: Dev experience: seed data, admin nav, requester status page

## Goals

Remove the friction that blocks developers and testers from exercising the
full request flow locally, and give requesters a self-service way to check
their event status without logging in.

## Problem

Three concrete breakages were found after Sprint 005:

1. **Content 404** — `jointheleague.org/content.json` does not yet exist.
   `CONTENT_JSON_URL` in dev was never updated, so the intake form loads no
   classes and cannot be submitted.

2. **Empty dev database** — The seed script only creates a "general" channel.
   No instructors, no registered sites, and no admin user exist, so coverage
   checks fail and the admin dashboard is blank even after fixing the content
   issue.

3. **Hidden admin pages** — Analytics (`/admin/analytics`) was added in Sprint
   009 (ticket 009) but never added to `ADMIN_NAV` in `AppLayout.tsx`. The
   page is reachable only by typing the URL.

Additionally, the open TODO `requester-registration-visibility.md` notes that
requesters have no dedicated way to check event status after submitting — they
must wait for an email.

## Solution

1. **Expand `tests/fixtures/content.json`** to include real-ish League classes
   (Python, Scratch, Robotics, Game Design, JavaScript, Web Design). Ensure
   `CONTENT_JSON_URL` in `config/dev/public.env` already points to this file
   via `file://` URL (it does — no env change needed).

2. **Extend `server/prisma/seed.ts`** (SQLite-compatible) to upsert: 3
   instructors with varied zip codes, topic sets, and travel ranges; 2
   registered sites; and 1 admin user. The script is idempotent — safe to
   run on reset or fresh checkout.

3. **Add `/admin/analytics` to `ADMIN_NAV`** in `AppLayout.tsx` so it appears
   in the admin sidebar between Requests and Email Queue.

4. **Add a requester status page** at `/requests/:id?token=:token`. The
   `verificationToken` from `EventRequest` serves as the access token. The
   page (no login required) shows: request status, class title, confirmed
   date (if set), registration count, and a link to the public event page
   once the request is confirmed. A new Express route
   `GET /api/requests/:id/status` accepts `?token=` and returns the safe
   subset of request fields.

## Success Criteria

- Developer can run `npx prisma db seed` on a fresh SQLite dev database
  and immediately use the intake form end-to-end without manual data entry.
- Content fixture has at least 5 requestable classes with realistic topics
  that match instructor topic sets in the seed.
- All sprint 4-5 admin pages are reachable from the admin sidebar.
- A requester who has the link emailed to them can view their request status
  without logging in.
- All existing tests continue to pass.

## Scope

### In Scope

- `tests/fixtures/content.json` — expand to 6–8 classes
- `server/prisma/seed.ts` — add instructors, sites, admin user; support
  SQLite (not just PrismaPg)
- `client/src/components/AppLayout.tsx` — add `/admin/analytics` to
  `ADMIN_NAV`
- `server/src/routes/requests.ts` (or new file) — add `GET /api/requests/:id/status?token=`
- `client/src/pages/RequesterStatus.tsx` — new public page
- Route registration in `App.tsx` for `/requests/:id`
- Email service: include requester status URL in verification email

### Out of Scope

- Changes to the Prisma schema (no new fields needed)
- Modifying any existing test files (only add new tests for new routes/pages)
- Production seed data or migrations
- Any new admin functionality beyond the nav fix

## Test Strategy

- **Unit**: ContentService test already covers `file://` URLs; no changes
  needed.
- **Server integration**: New test for `GET /api/requests/:id/status` —
  happy path (valid token), wrong token (403), not found (404).
- **Client**: Light smoke test for `RequesterStatus` page rendering with
  mocked data.
- Run `npm run test:server` and `npm run test:client` after each ticket.

## Architecture Notes

- The seed script must work with the SQLite adapter used in dev
  (`@prisma/adapter-better-sqlite3`), not PrismaPg. The current seed.ts
  unconditionally uses PrismaPg — this must be fixed (switch to the same
  lazy init pattern as `server/src/services/prisma.ts`).
- The status endpoint must NOT leak internal fields (assignedInstructorId,
  verificationToken, emailThreadAddress, asanaTaskId). It returns only:
  `{ id, status, classSlug, classTitle, confirmedDate, registrationCount,
    publicEventUrl }`.
- Token check: compare `?token` against `verificationToken`. If they do not
  match, return 403. No rate limiting needed for v1 (tokens are 256-bit UUIDs).
- `RequesterStatus` is a fully public page — no auth context required. It
  uses the same tokenized pattern as `EventPage` (`/events/:requestId`).
- The route `/requests/:id` must be added outside the `AppLayout` wrapper in
  `App.tsx` so it renders without the sidebar.

## GitHub Issues

(None linked — internal sprint.)

## Definition of Ready

Before tickets can be created, all of the following must be true:

- [x] Sprint planning documents are complete (sprint.md, use cases, architecture)
- [ ] Architecture review passed
- [ ] Stakeholder has approved the sprint plan

## Tickets

| # | Title | Status |
|---|-------|--------|
| 001 | Dev seed data — instructors, sites, admin user | todo |
| 002 | Expand content fixture with real League classes | todo |
| 003 | Admin sidebar navigation — add missing sprint 4-5 links | todo |
| 004 | Requester status page — tokenized status view | todo |
