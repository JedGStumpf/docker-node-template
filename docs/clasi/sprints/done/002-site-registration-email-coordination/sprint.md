---
id: '002'
title: Site Registration & Email Coordination
status: done
branch: sprint/002-site-registration-email-coordination
use-cases:
- SUC-001
- SUC-002
- SUC-003
- SUC-004
- SUC-005
- SUC-006
- SUC-007
- SUC-008
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Sprint 002: Site Registration & Email Coordination

## Goals

- Enable admins to invite venues (libraries, schools, community centers) to register as recognised sites in the system.
- Allow site representatives to self-register via a tokenized email invitation and authenticate via magic-link email (with optional Google OAuth).
- Surface registered sites in the intake form so requesters can pick from known venues.
- Provision a unique per-request email thread address when a request is verified, and propagate it as `Reply-To` on all outgoing notification emails.
- Automatically add the site rep to email threads when their registered site is selected on a request.
- Create an Asana task when a request is verified, and store the task link on the request.
- Expand the admin requests dashboard to support search, filter by status, and per-request detail.

## Problem

Sprint 1 delivered the core intake and consent flow, but several critical coordination pieces are missing:

1. **No venue registry** — the intake form accepts free-text locations only; the system cannot notify venue contacts automatically.
2. **No email threading** — every outbound email is isolated; replies go nowhere useful and there is no shared coordination thread.
3. **No Asana task** — the admins' existing workflow depends on Asana; without automatic task creation, the system does not integrate into the team's daily process.
4. **Minimal admin dashboard** — admins can only list `new`/`unverified` requests; there is no search, filter, or status management.

## Solution

1. **`RegisteredSite` model + admin site management** — Admins create site records and send tokenized invitation emails to venue contacts. Site reps click the link and complete venue registration.
2. **Site rep authentication** — Magic-link email (primary); optional Google OAuth (secondary). Uses a `SiteRep` model separate from the Pike13 instructor user.
3. **Site picker on intake form** — The `GET /api/sites` endpoint returns registered sites for the intake form autocomplete. Free-text fallback remains.
4. **Email thread address** — On `EventRequest` transition from `unverified` → `new`, a deterministic unique address (`req-{ulid}@threads.<domain>`) is generated and stored on the request as `emailThreadAddress`. This address is set as `Reply-To` on all outgoing notification emails for that request.
5. **Site rep automatic inclusion** — When a request has a `registeredSiteId`, the site rep receives a notification email (with the thread address as Reply-To) when the request reaches `new`.
6. **Asana task creation** — `AsanaService` creates a task in the configured project when a request is verified. Requires `ASANA_ACCESS_TOKEN` + `ASANA_PROJECT_GID` env vars. Degrades gracefully (logs warning, continues) if not configured.
7. **Expanded admin dashboard API** — `GET /api/admin/requests` gains search, status filter, pagination, and a per-request detail endpoint.

## Success Criteria

- An admin can send a site invitation, a site rep can complete registration, and the resulting `RegisteredSite` appears in the site picker on the intake form.
- A site rep can authenticate via magic-link email and view their site's details.
- When a requester picks a registered site and the request is verified, the site rep automatically receives a notification email with the thread `Reply-To` address.
- Every verified request has a unique `emailThreadAddress` stored and used as `Reply-To` on all related outbound emails.
- An Asana task is created when a request is verified (when credentials are configured); task creation failures do not prevent request verification.
- The admin can filter requests by status, search by requester name/email, and view per-request detail including site, assigned instructor, Asana link, and thread address.
- All server-side behaviour is covered by Vitest + Supertest tests (no real Asana, SES, or Google calls in tests).

## Scope

### In Scope

**Data model:**
- `RegisteredSite` — venue name, address, lat/lng (geocoded at save), capacity, room notes, active flag
- `SiteInvitation` — tokenized invitation (email, token, expiry, used flag)
- `SiteRep` — venue contact user (email, name, googleId optional, site FK)
- `SiteRepSession` — magic-link tokens (token, expiresAt, used)
- `EventRequest` additions: `registeredSiteId` (FK nullable), `emailThreadAddress`, `asanaTaskId`

**Authentication:**
- Magic-link login for site reps (`POST /api/auth/magic-link/request`, `POST /api/auth/magic-link/verify`) — 24-hour token TTL
- Google OAuth for site reps is **deferred** to a later sprint

**Site management (admin):**
- `POST /api/admin/sites/invite` — create invitation + send email
- `GET /api/admin/sites` — list active sites
- `GET /api/admin/sites/:id` — site detail with rep info
- `PUT /api/admin/sites/:id` — edit site

**Site registration (public):**
- `GET /api/site-reg/:token` — validate invitation token, return pre-fill data
- `POST /api/site-reg/:token` — submit registration (creates `RegisteredSite` + `SiteRep`; marks invitation used)

**Site rep routes:**
- `GET /api/site-rep/profile` — get own site details (requires site rep session)
- `PUT /api/site-rep/profile` — update site details

**Intake form support:**
- `GET /api/sites` — return list of active registered sites for autocomplete (public, no auth)

**Email thread address:**
- Deterministic unique address generated on `unverified` → `new` transition
- Stored as `EventRequest.emailThreadAddress`
- Set as `Reply-To` on all existing notification emails (match notification, admin notification, site rep notification)

**Site rep notification:**
- When request reaches `new` and `registeredSiteId` is set: send site rep notification email (thread Reply-To included)

**Asana integration:**
- `AsanaService` with interface `IAsanaClient` (real HTTP client + mock for tests)
- Task created on `unverified` → `new` transition; `asanaTaskId` stored on request
- Graceful degradation: if `ASANA_ACCESS_TOKEN` or `ASANA_PROJECT_GID` unset, skip and warn

**Admin dashboard expansion:**
- `GET /api/admin/requests` gains query params: `status`, `search` (requester name/email), `page`, `limit`
- `GET /api/admin/requests/:id` — per-request detail (includes site, assignments, Asana link, emailThreadAddress)
- `PUT /api/admin/requests/:id/status` — admin status override (e.g. cancel, move to discussing)

**Client UI:**
- Site picker component on intake form (autocomplete from `GET /api/sites`, with free-text fallback)
- Admin requests list page: status filter tabs, search box, pagination
- Admin request detail page: full detail view

### Out of Scope

- Inbound SES email processing / AI extraction — Sprint 5
- Date voting, private/public registration flows — Sprint 3
- Meetup integration — Sprint 4
- Pike13 write-back (booking confirmed instructor) — Phase 2
- Site rep ability to view or manage requests — Sprint 3+
- Admin ability to edit registered sites' geographic coverage — post-launch
- Equipment reservation — Phase 3

## Test Strategy

All server tests use Vitest + Supertest with SQLite. File parallelism remains disabled.

- **`site-registration.test.ts`** — site invitation creation, invitation token validation, site rep registration, duplicate suppression
- **`site-rep-auth.test.ts`** — magic-link request, verify, expiry, Google OAuth link/unlink
- **`admin-sites.test.ts`** — admin site CRUD, invitation list, requires admin auth
- **`email-thread.test.ts`** — `emailThreadAddress` set on verification, Reply-To in outgoing mocked emails, site rep notification dispatch
- **`asana-integration.test.ts`** — asana task created on verification; graceful skip when unconfigured; mock `IAsanaClient`
- **`admin-requests-v2.test.ts`** — search/filter/pagination, per-request detail, status override
- **Client (`tests/client/`)** — `SitePicker.test.tsx`, updated `Home.test.tsx` for site picker integration

All outbound HTTP to Asana is isolated behind `IAsanaClient` injected via `ServiceRegistry`; tests use a mock. Google OAuth is tested using the existing `POST /api/auth/test-login` pattern extended with `role: SITE_REP`.

## Architecture Notes

- `SiteService` added to `ServiceRegistry`: manages sites, invitations, and site rep accounts.
- `AsanaService` added to `ServiceRegistry`: interface-first (`IAsanaClient`), real implementation wraps `node-asana` or direct HTTPS; unconfigured state returns no-op.
- Email thread address strategy: `req-{ulid}@threads.{THREAD_DOMAIN}`. `THREAD_DOMAIN` is an env var (e.g. `threads.jointheleague.org`). Address generated at verification time, stored on request. No SES API call needed per address — SES receiving rule matches the whole subdomain with a wildcard.
- Magic-link tokens: UUID, stored hashed in `SiteRepSession`, 15-minute TTL (configurable via `MAGIC_LINK_TTL_MINUTES`).
- Google OAuth for site reps reuses the existing Google OAuth infrastructure (`/api/auth/google` callback) via a `SITE_REP` role branch added to the callback handler.
- Lat/lng geocoding for `RegisteredSite.address`: use US zip code centroid (same bundled data as `MatchingService`) when the site ZIP is available; skip if no ZIP match. Full geocoding API is out of scope.

## GitHub Issues

(None yet.)

## Definition of Ready

Before tickets can be created, all of the following must be true:

- [ ] Sprint planning documents are complete (sprint.md, use cases, architecture)
- [ ] Architecture review passed
- [ ] Stakeholder has approved the sprint plan

## Tickets

(To be created after stakeholder approval.)

## Definition of Ready

Before tickets can be created, all of the following must be true:

- [ ] Sprint planning documents are complete (sprint.md, use cases, architecture)
- [ ] Architecture review passed
- [ ] Stakeholder has approved the sprint plan

## Tickets

(To be created after sprint approval.)
