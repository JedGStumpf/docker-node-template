---
sprint: "002"
status: approved
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Architecture Update — Sprint 002: Site Registration & Email Coordination

## What Changed

### New Prisma Models

**`RegisteredSite`** — Venue record. Fields: `id`, `name`, `address`, `city`, `state`, `zipCode`, `lat` (Float, nullable), `lng` (Float, nullable), `capacity` (Int, nullable), `roomNotes` (String, nullable), `active` (Bool, default true), `createdAt`, `updatedAt`. Lat/lng populated from the bundled zip centroid data when a matching ZIP is found at save time.

**`SiteInvitation`** — Tokenized invitation for a new site. Fields: `id`, `token` (String, unique), `contactEmail`, `contactName`, `registeredSiteId` (FK nullable — set after registration), `expiresAt`, `usedAt` (DateTime nullable), `createdAt`. Token is stored as a random UUID; the invitation URL embeds the raw token.

**`SiteRep`** — Venue contact user. Fields: `id`, `email` (unique), `displayName`, `googleId` (String, nullable), `registeredSiteId` (FK), `createdAt`, `updatedAt`.

**`SiteRepSession`** — Magic-link token. Fields: `id`, `siteRepId` (FK), `tokenHash` (String, unique — SHA-256 hex of the raw UUID token), `expiresAt`, `usedAt` (nullable), `createdAt`. Token is never stored plainly; lookup is by hash. SHA-256 (`crypto.createHash('sha256')`) is used — not bcrypt — because this is a short-lived token lookup, not password storage. bcrypt's intentional slowness is unsuitable here.

**`EventRequest` additions:**
- `registeredSiteId` — FK to `RegisteredSite`, nullable.
- `emailThreadAddress` — String, nullable. Set on `unverified` → `new` transition.
- `asanaTaskId` — String, nullable. Set after successful Asana task creation.

### New Services (registered on `ServiceRegistry`)

**`SiteService`** — Manages `RegisteredSite`, `SiteInvitation`, and `SiteRep` records. Methods: `createInvitation`, `getInvitationByToken`, `registerSite`, `listSites` (active only, for picker), `adminListSites`, `getSiteDetail`, `updateSite`, `createMagicLink`, `verifyMagicLink`.

**`AsanaService`** — Interface-first task creation. Interface `IAsanaClient` has one method: `createTask({ name, notes, projectGid }): Promise<{ gid: string }>`. Real implementation in `server/src/services/asana.client.ts` using the `asana` npm package. `ServiceRegistry` injects a mock in test environments. The service itself checks for `ASANA_ACCESS_TOKEN` + `ASANA_PROJECT_GID`; if absent it returns `null` (no-op) instead of throwing.

### Modified Services

**`RequestService.verifyRequest`** — Extended to:
1. Generate `emailThreadAddress = req-{ulid}@threads.{process.env.THREAD_DOMAIN}` (if `THREAD_DOMAIN` set).
2. Call `AsanaService.createRequestTask(request)` and store `asanaTaskId`.
3. If `request.registeredSiteId` is set, call `EmailService.sendSiteRepNotification`.

**`EmailService`** — New methods: `sendSiteInvitation`, `sendMagicLink`, `sendSiteRepNotification`. All existing notification methods (`sendAdminNewRequestNotification`, `sendMatchNotification`, `sendMatchReminder`) gain an optional `replyTo` parameter; when provided it sets the `Reply-To` header.

### New API Routes

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/sites` | — | List active registered sites (for intake form autocomplete) |
| GET | `/api/site-reg/:token` | — | Validate invitation token, return pre-fill data |
| POST | `/api/site-reg/:token` | — | Submit site registration |
| POST | `/api/auth/magic-link/request` | — | Request magic-link email |
| POST | `/api/auth/magic-link/verify` | — | Verify magic-link token, create session |
| GET | `/api/site-rep/profile` | site-rep | Get own site details |
| PUT | `/api/site-rep/profile` | site-rep | Update own site details |
| POST | `/api/admin/sites/invite` | admin | Create site invitation |
| GET | `/api/admin/sites` | admin | List all registered sites |
| GET | `/api/admin/sites/:id` | admin | Get site detail |
| PUT | `/api/admin/sites/:id` | admin | Edit site |
| GET | `/api/admin/requests` (extended) | admin | Search/filter requests with pagination |
| GET | `/api/admin/requests/:id` | admin | Per-request detail |
| PUT | `/api/admin/requests/:id/status` | admin | Admin status override |

### Client Changes

- **`SitePicker` component** — New component on the intake form: autocomplete against `GET /api/sites` results, with free-text fallback when nothing is selected.
- **Admin requests list page** — Status filter tabs, search input, pagination controls.
- **Admin request detail page** — Full detail view with site, instructor, Asana link, thread email.

## Why

Sprint 1 built the request intake and consent flow but left a manual gap: admins receive no structured email thread and must create Asana tasks by hand. Without venue registration, the system cannot notify site contacts or link requests to known locations. Sprint 2 closes these gaps by wiring up the three coordination channels (email threading, venue contacts, Asana) that the League's existing workflow depends on, and expanding the admin dashboard to make the pipeline manageable.

## Impact on Existing Components

- **`RequestService.verifyRequest`** — Extended with thread address generation, Asana call, and site rep notification. All three are additive; no existing logic is altered.
- **`EmailService`** notification methods — `replyTo` parameter is optional with `undefined` default; existing call sites continue to work unchanged.
- **`POST /api/requests`** — Now accepts optional `registeredSiteId`; existing callers without it are unaffected.
- **`GET /api/admin/requests`** — Gains optional query params; existing callers without params get the original unfiltered result (backward compatible).
- **Session middleware** — Must recognise a new `SITE_REP` role alongside `INSTRUCTOR` and `ADMIN`. Middleware helpers `requireAuth`, `requireAdmin` need a companion `requireSiteRep` guard.
- **`ServiceRegistry`** — Two new service properties: `sites`, `asana`. No existing service signatures change.

## Migration Concerns

New migration adds five schema changes: four new tables (`RegisteredSite`, `SiteInvitation`, `SiteRep`, `SiteRepSession`) and three new nullable columns on `EventRequest`. All are backward-compatible additive changes; no data transformation needed. SQLite push script requires no manual adjustment beyond running `sqlite-push.sh` again to regenerate the SQLite schema.

## Decisions

1. **Magic-link token TTL** — Set to **24 hours**. Site reps are infrequent users who may not check email immediately; 24 hours reduces friction without meaningfully widening the attack window. Configurable via `MAGIC_LINK_TTL_MINUTES` env var.

2. **Google OAuth for site reps** — **Deferred to a later sprint.** Sprint 2 ships magic-link-only. Google OAuth link/unlink is out of scope; `SiteRep.googleId` field will not be added in this sprint.

3. **Asana task fields** — Create with **name + notes + project + assignee**. `AsanaService.createRequestTask` will accept `assigneeGid` from `ASANA_ASSIGNEE_GID` env var (optional; if absent, task is created without an assignee — graceful degradation preserved).

4. **Site invitation expiry** — **7 days** as originally proposed. Admins can resend expired invitations.
