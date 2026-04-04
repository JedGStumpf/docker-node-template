---
timestamp: '2026-04-04T20:45:14'
parent: team-lead
child: sprint-executor
scope: /workspaces/docker-node-template
sprint: 006-dev-experience-seed-data-admin-nav-requester-status-page
context_documents:
- docs/clasi/sprints/006-dev-experience-seed-data-admin-nav-requester-status-page/sprint.md
- docs/clasi/sprints/006-dev-experience-seed-data-admin-nav-requester-status-page/architecture-update.md
- docs/clasi/sprints/006-dev-experience-seed-data-admin-nav-requester-status-page/usecases.md
result: success
files_modified:
- server/prisma/seed.ts
- tests/fixtures/content.json
- tests/server/content-service.test.ts
- client/src/components/AppLayout.tsx
- tests/client/AppLayout.test.tsx
- server/src/routes/requests.ts
- client/src/pages/RequesterStatus.tsx
- client/src/App.tsx
- tests/server/requester-status.test.ts
- tests/client/RequesterStatus.test.tsx
---

# Dispatch: team-lead → sprint-executor

You are the sprint executor for Sprint 006: "Dev experience: seed data, admin nav, requester status page". Execute all 4 tickets sequentially using the execute-ticket skill. The sprint branch is `sprint/006-dev-experience-seed-admin-nav-requester-status` and is already checked out.

Working directory: /workspaces/docker-node-template
You may only create or modify files under: /workspaces/docker-node-template (scoped to the sprint branch — do not touch unrelated files outside ticket scope).
You may read files from any location.

---

## SE PROCESS — MANDATORY

Before doing anything else, call `get_se_overview()` and `get_version()` to load the process. Then call `get_skill_definition("execute-ticket")` for the full ticket lifecycle. Follow it exactly for each ticket:
1. Create a ticket plan file
2. Set ticket status to in-progress
3. Dispatch a code-monkey subagent to implement
4. Run tests
5. Code review
6. Commit
7. Move ticket to done, commit the move

Do NOT skip any step. Do NOT mark a ticket done until the file is in `tickets/done/` and committed.

---

## SPRINT 006 FULL SPEC

### sprint.md

```
---
id: "006"
title: "Dev experience: seed data, admin nav, requester status page"
status: active
branch: sprint/006-dev-experience-seed-admin-nav-requester-status
---

# Sprint 006: Dev experience: seed data, admin nav, requester status page

## Goals
Remove the friction that blocks developers and testers from exercising the
full request flow locally, and give requesters a self-service way to check
their event status without logging in.

## Problem
1. Content 404 — `jointheleague.org/content.json` does not yet exist. `CONTENT_JSON_URL` in dev was never updated, so the intake form loads no classes and cannot be submitted.
2. Empty dev database — The seed script only creates a "general" channel. No instructors, no registered sites, and no admin user exist.
3. Hidden admin pages — Analytics (`/admin/analytics`) was added but never added to `ADMIN_NAV` in `AppLayout.tsx`.
Additionally, requesters have no dedicated way to check event status after submitting.

## Solution
1. Expand `tests/fixtures/content.json` to include real-ish League classes.
2. Extend `server/prisma/seed.ts` (SQLite-compatible) to upsert: 3 instructors, 2 registered sites, and 1 admin user.
3. Add `/admin/analytics` to `ADMIN_NAV` in `AppLayout.tsx`.
4. Add a requester status page at `/requests/:id?token=:token`.

## Architecture Notes
- The seed script must work with the SQLite adapter used in dev (`@prisma/adapter-better-sqlite3`), not PrismaPg. The current seed.ts unconditionally uses PrismaPg — fix this using the same lazy init pattern as `server/src/services/prisma.ts`.
- The status endpoint must NOT leak internal fields (assignedInstructorId, verificationToken, emailThreadAddress, asanaTaskId). Returns only: `{ id, status, classSlug, classTitle, confirmedDate, registrationCount, publicEventUrl }`.
- Token check: compare `?token` against `registrationToken`. If they do not match, return 404. (registrationToken is the field used — NOT verificationToken.)
- `RequesterStatus` is a fully public page — no auth context required.
- The route `/requests/:id` must be added outside the `AppLayout` wrapper in `App.tsx`.
- The status URL (`/requests/:id?token=:registrationToken`) is shown on the post-verification redirect — update the verify endpoint to redirect there instead of returning JSON `{ status }`.
```

### architecture-update.md (full)

```
---
sprint: "006"
status: draft
---

# Architecture Update — Sprint 006

## What Changed

### 1. Content Fixture Expansion
`tests/fixtures/content.json` gains additional classes: JavaScript Fundamentals, Web Design, Game Design, Robotics Intro, Advanced Robotics. Total: 8 classes (6+ requestable). Topics align with the topic strings used in the seeded instructor profiles.

No new files, no new service code. ContentService already handles `file://` URLs.

### 2. Dev Seed Script Overhaul (`server/prisma/seed.ts`)
Changes:
- Switch to the same adapter-detection pattern used in `server/src/services/prisma.ts`: parse `DATABASE_URL`; use `PrismaPg` for `postgresql://`, `PrismaBetterSqlite3` for `file:` URLs.
- Add upserts for:
  - `InstructorProfile` × 3: varied zip codes (92101, 90210, 10001), topic sets matching fixture classes, service zip arrays.
  - `RegisteredSite` × 2: library and school with realistic address data.
  - `User` × 1: admin account (admin@jointheleague.org, role ADMIN).
- Preserve existing channel upsert.
No schema changes. All new upserts use existing models.

### 3. Admin Sidebar Nav Fix (`client/src/components/AppLayout.tsx`)
Add `{ to: '/admin/analytics', label: 'Analytics' }` to the `ADMIN_NAV` array, positioned after `Requests` and before `Email Queue`. Email Queue is already present.

### 4. Requester Status API
New route: `GET /api/requests/:id/status?token=:token`
Logic:
1. Find `EventRequest` by `id`.
2. If not found → 404.
3. If `req.query.token !== record.registrationToken` → 404.
4. Fetch registration count via `prisma.registration.count({ where: { requestId: id } })`.
5. Return safe DTO: `{ id, status, classSlug, classTitle, confirmedDate, registrationCount, publicEventUrl }`

Registered in `server/src/index.ts` alongside other public routes (no auth middleware).

### 5. Requester Status Page (`client/src/pages/RequesterStatus.tsx`)
New React page, fully public (no AppLayout wrapper, no auth check).
Reads `:id` from `useParams()` and `token` from `useSearchParams()`.
Fetches `GET /api/requests/:id/status?token=` on mount.
States: Loading, 404 error, success (status card).
Route added to `App.tsx` **outside** `AppLayout`.

### 6. Post-Verification Redirect
After verify succeeds, redirect to `/requests/:id?token=:registrationToken` instead of returning JSON.
```

---

## TICKETS (full spec)

### TICKET 001: Dev seed data — instructors, sites, admin user

```
---
id: "001"
title: "Dev seed data — instructors, sites, admin user"
status: todo
depends-on: []
---

# Dev seed data — instructors, sites, admin user

## Description
Rewrite `server/prisma/seed.ts` to support SQLite and upsert dev data so the request form works end-to-end locally. Must be idempotent.

Seed data to create:
- 3 instructors with varying zip codes (92101, 90210, 10001), topics (python/scratch, robotics, game-design), maxTravelMinutes 120
- 2 registered sites: a library and a school
- 1 admin user (email: admin@jointheleague.org, role: ADMIN)

## Acceptance Criteria
- [ ] `npx prisma db seed` runs without error on a fresh dev database
- [ ] Running it twice does not duplicate records (upserts, not inserts)
- [ ] After seeding, `GET /api/requests/availability?zip=92101&classSlug=python-intro` returns `available: true`
- [ ] Dev README or comment in seed file explains what data is created

## Testing
- Existing tests to run: `npm run test:server` — verify no regressions
- New tests to write: No automated test needed; manual verification via availability endpoint
- Verification command: `npx prisma db seed && curl "http://localhost:3000/api/requests/availability?zip=92101&classSlug=python-intro"`
```

### TICKET 002: Expand content fixture with real League classes

```
---
id: "002"
title: "Expand content fixture with real League classes"
status: todo
depends-on: []
---

# Expand content fixture with real League classes

## Description
Replace/expand the 3-class stub in `tests/fixtures/content.json` with 6-8 classes.
IMPORTANT: `config/dev/public.env` already has `CONTENT_JSON_URL=file:///workspaces/docker-node-template/tests/fixtures/content.json` — no env change needed.

Classes to add (all requestable: true unless noted):
- python-intro (already present)
- scratch-basics (already present)
- javascript-intro
- game-design
- robotics-intro
- web-design
- data-science-intro
- advanced-robotics (requestable: false — already present)

Each class entry must include: slug, title, description, ageRange, topics, typicalDurationMinutes, equipmentNeeded, requestable.

## Acceptance Criteria
- [ ] `tests/fixtures/content.json` has at least 6 requestable classes
- [ ] Each class has all required fields
- [ ] `config/dev/public.env` CONTENT_JSON_URL uses `file://` path (already correct — just verify)
- [ ] All existing tests still pass (`npm run test:server && npm run test:client`)

## Testing
- Existing tests to run: `npm run test:server && npm run test:client`
- New tests to write: None
- Verification command: `npm run test:server && npm run test:client`
```

### TICKET 003: Admin sidebar navigation — add missing sprint 4-5 links

```
---
id: "003"
title: "Admin sidebar navigation — add missing sprint 4-5 links"
status: todo
depends-on: []
---

# Admin sidebar navigation — add missing sprint 4-5 links

## Description
Add missing admin pages to ADMIN_NAV in `client/src/components/AppLayout.tsx`.
IMPORTANT: Email Queue (`/admin/email-queue`) is ALREADY present in ADMIN_NAV. Only Analytics is missing.
Also verify all other sprint 4-5 admin pages are linked.

Links to add:
- `/admin/analytics` — "Analytics" (position: after Requests, before Email Queue)

Also verify present (do not duplicate):
- `/admin/email-queue` — already present
- `/admin/requests` — already present

## Acceptance Criteria
- [ ] `/admin/analytics` appears in the admin sidebar as "Analytics"
- [ ] `/admin/email-queue` appears in the admin sidebar as "Email Queue" (already present)
- [ ] All existing admin nav links still work (no broken links)
- [ ] `npm run test:client` passes

## Testing
- Existing tests to run: `npm run test:client`
- New tests to write: A client test that renders `AppLayout` with an admin user and asserts the Analytics nav link is present
- Verification command: `npm run test:client`
```

### TICKET 004: Requester status page — tokenized status view

```
---
id: "004"
title: "Requester status page — tokenized status view"
status: todo
depends-on: []
---

# Requester status page — tokenized status view

## Description
After a request is verified, redirect to `/requests/:id?token=:registrationToken` (status page). No login required — access gated by `registrationToken` on the request record.

### Server changes
1. Add `GET /api/requests/:id/status?token=` in `server/src/routes/requests.ts`:
   - Find request by id → 404 if not found
   - Compare `token` query param to `request.registrationToken` → 404 if mismatch or missing
   - Return: `{ id, status, classSlug, classTitle, confirmedDate, registrationCount, publicEventUrl }`
   - Register WITHOUT auth middleware in `server/src/index.ts`

2. Update verify endpoint (`POST /api/requests/:id/verify`): on success, redirect (302) to `/requests/${id}?token=${registrationToken}` instead of returning JSON `{ status }`. If registrationToken is null (old records), fall back to JSON response.

### Client changes
1. New `client/src/pages/RequesterStatus.tsx` at route `/requests/:id`:
   - Reads `id` from `useParams()`, `token` from `useSearchParams()`
   - Fetches `GET /api/requests/:id/status?token=`
   - Shows: status label, confirmed date if set, registration count, link to `/events/:id` once confirmed
   - Shows "Check back later" for early statuses (unverified, new)

2. Register route in `client/src/App.tsx` OUTSIDE AppLayout (same pattern as `/events/:requestId`).

## Acceptance Criteria
- [ ] `GET /api/requests/:id/status?token=` returns status for valid token
- [ ] Returns 404 for invalid or missing token
- [ ] Page renders at `/requests/:id?token=` without login
- [ ] Verification success redirects to the status page
- [ ] `npm run test:server` passes (happy-path + 404 token tests)
- [ ] `npm run test:client` passes

## Testing
- New tests:
  - Server: `tests/server/requester-status.test.ts` — valid token 200, invalid token 404
  - Client: `tests/client/RequesterStatus.test.tsx` — renders status labels
- Verification command: `npm run test:server && npm run test:client`
```

---

## KEY SOURCE FILES (current state)

### server/prisma/seed.ts (CURRENT — needs rewrite)
```typescript
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const general = await prisma.channel.upsert({
    where: { name: 'general' },
    update: {},
    create: { name: 'general', description: 'General discussion' },
  });
  console.log(`Seed: channel "${general.name}" (id=${general.id})`);
}

main()
  .catch((e) => { console.error('Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

### Adapter detection pattern (from server/src/services/prisma.ts) — USE THIS in seed.ts
```typescript
// Simple adapter detection for seed — no middleware needed
async function createPrisma() {
  const { PrismaClient } = await import('../src/generated/prisma/client.js');
  const url = process.env.DATABASE_URL ?? '';
  if (url.startsWith('file:')) {
    const { PrismaBetterSqlite3 } = await import('@prisma/adapter-better-sqlite3');
    const adapter = new PrismaBetterSqlite3({ url });
    return new PrismaClient({ adapter });
  } else {
    const { PrismaPg } = await import('@prisma/adapter-pg');
    const adapter = new PrismaPg({ connectionString: url });
    return new PrismaClient({ adapter });
  }
}
```

IMPORTANT for SQLite: `InstructorProfile.topics` and `serviceZips` are String[] (JSON-encoded in SQLite). When upserting in the seed, pass `JSON.stringify([...])` for these fields when using SQLite. Check `DATABASE_URL.startsWith('file:')` to decide.

### Prisma schema (relevant models)
```prisma
model User {
  id          Int       @id @default(autoincrement())
  email       String    @unique
  displayName String?
  role        UserRole  @default(USER)  // enum: USER | ADMIN
  avatarUrl   String?
  provider    String?
  providerId  String?
}

model InstructorProfile {
  id               Int       @id @default(autoincrement())
  pike13UserId     String    @unique   // required unique field
  displayName      String
  email            String
  topics           String[]
  homeZip          String
  maxTravelMinutes Int       @default(60)
  serviceZips      String[]  @default([])
  active           Boolean   @default(true)
}

model RegisteredSite {
  id        Int     @id @default(autoincrement())
  name      String
  address   String
  city      String
  state     String
  zipCode   String
  capacity  Int?
  roomNotes String?
  active    Boolean @default(true)
}

model EventRequest {
  id                String    @id @default(uuid())
  classSlug         String
  status            RequestStatus
  confirmedDate     DateTime?
  registrationToken String?   @unique   // USE THIS for status page token gate
  verificationToken String    @unique   // used only for email verification, do NOT use for status page
  registrations     Registration[]
}
```

### client/src/components/AppLayout.tsx ADMIN_NAV (CURRENT)
```typescript
const ADMIN_NAV: NavItem[] = [
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/channels', label: 'Channels' },
  { to: '/admin/env', label: 'Environment' },
  { to: '/admin/db', label: 'Database' },
  { to: '/admin/config', label: 'Configuration' },
  { to: '/admin/logs', label: 'Logs' },
  { to: '/admin/sessions', label: 'Sessions' },
  { to: '/admin/permissions', label: 'Permissions' },
  { to: '/admin/scheduler', label: 'Scheduled Jobs' },
  { to: '/admin/import-export', label: 'Import/Export' },
  { to: '/admin/requests', label: 'Requests' },
  { to: '/admin/email-queue', label: 'Email Queue' },  // ALREADY PRESENT — do not duplicate
  // Analytics is MISSING — add between Requests and Email Queue
];
```

### client/src/App.tsx (CURRENT — relevant section)
```tsx
{/* Public event registration (no auth required) */}
<Route path="/events/:requestId" element={<EventPage />} />
{/* Add RequesterStatus the same way — outside AppLayout wrapper */}
```

### server/src/routes/requests.ts (CURRENT verify endpoint)
```typescript
/** POST /api/requests/:id/verify */
requestsRouter.post('/requests/:id/verify', async (req, res) => {
  // ... validates token, calls verifyRequest ...
  res.json({ status: updated.status });  // <-- change this to redirect for ticket 004
});
```

---

## CODING STANDARDS
- Fail fast, validate at boundaries, no silent failures
- Descriptive names, no catch-all utils
- No unnecessary abstractions for one-time operations

## TESTING (Vitest + Supertest for server; Vitest + RTL for client)
- Server tests: `tests/server/<feature>.test.ts`
- Client tests: `tests/client/<Component>.test.tsx`
- Auth in server tests: use `POST /api/auth/test-login` with `request.agent(app)`
- Run `npm run test:server` for server changes, `npm run test:client` for client changes
- All tests must pass before committing

## GIT WORKFLOW
- Branch: `sprint/006-dev-experience-seed-admin-nav-requester-status`
- Commit format: `feat: <summary> (#NNN, sprint 006)`
- Ticket move commit: `chore: move ticket #NNN to done`
- Never commit with failing tests

---

## EXECUTION ORDER
Execute sequentially: 001 → 002 → 003 → 004

For each ticket follow execute-ticket exactly:
1. Create plan file in tickets/ directory
2. Update ticket status to in-progress
3. Dispatch code-monkey to implement
4. Run tests, fix failures
5. Code review
6. Commit implementation
7. Move ticket + plan to tickets/done/
8. Commit the move


## Context Documents

- `docs/clasi/sprints/006-dev-experience-seed-data-admin-nav-requester-status-page/sprint.md`
- `docs/clasi/sprints/006-dev-experience-seed-data-admin-nav-requester-status-page/architecture-update.md`
- `docs/clasi/sprints/006-dev-experience-seed-data-admin-nav-requester-status-page/usecases.md`

# Response: sprint-executor

All 4 tickets executed and moved to done. 453 server tests + 72 client tests passing. Ticket 001: seed.ts rewritten with dual-adapter support (SQLite/Postgres), upserts 3 instructors, 2 sites, 1 admin user. Ticket 002: content.json expanded from 3 to 8 classes (7 requestable), updated count assertions. Ticket 003: Analytics added to ADMIN_NAV, new AppLayout test. Ticket 004: token-gated status API, verify redirect, RequesterStatus page, route outside AppLayout, 4 server + 5 client tests.
