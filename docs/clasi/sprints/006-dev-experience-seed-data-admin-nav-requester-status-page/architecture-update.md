---
sprint: "006"
status: draft
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Architecture Update — Sprint 006: Dev experience: seed data, admin nav, requester status page

## What Changed

### 1. Content Fixture Expansion
`tests/fixtures/content.json` gains 5 additional classes: JavaScript
Fundamentals, Web Design, Game Design with Scratch, Robotics Intro, and
Robotics Advanced. Total: 8 classes (6 requestable). Topics align with the
topic strings used in the seeded instructor profiles.

No new files, no new service code. The `ContentService` already handles
`file://` URLs; only the fixture data grows.

### 2. Dev Seed Script Overhaul (`server/prisma/seed.ts`)
The existing seed only creates a chat channel. It also unconditionally uses
`PrismaPg`, making it incompatible with the SQLite dev database.

Changes:
- Switch to the same adapter-detection pattern used in
  `server/src/services/prisma.ts`: parse `DATABASE_URL`; use
  `PrismaPg` for `postgresql://`, `PrismaLibSQL`/better-sqlite3 for
  `file:` URLs.
- Add upserts for:
  - `InstructorProfile` × 3: varied zip codes (e.g., 90210, 94105, 10001),
    topic sets matching fixture classes, and service zip arrays.
  - `RegisteredSite` × 2: library and school with realistic address data.
  - `User` × 1: admin account (`admin@jointheleague.org`, role `ADMIN`).
- Preserve existing channel upsert.

No schema changes. All new upserts use existing models.

### 3. Admin Sidebar Nav Fix (`client/src/components/AppLayout.tsx`)
Add `{ to: '/admin/analytics', label: 'Analytics' }` to the `ADMIN_NAV`
array, positioned after `Requests` and before `Email Queue` for logical
grouping. (Email Queue was already present in the nav.)

One-line change to a static data array. No component logic affected.

### 4. Requester Status API (`server/src/routes/requests-status.ts` or inline)
New Express route module (or added to existing routes):

```
GET /api/requests/:id/status?token=:token
```

Logic:
1. Find `EventRequest` by `id`.
2. If not found → 404.
3. If `req.query.token !== record.registrationToken` → 403.
4. Fetch registration count via `prisma.registration.count({ where: { requestId: id } })`.
5. Look up class title from `ContentService.getClass(classSlug)`.
6. Return safe DTO:
   ```typescript
   {
     id, status, classSlug, classTitle,
     confirmedDate: confirmedDate?.toISOString() ?? null,
     registrationCount,
     publicEventUrl: status === 'confirmed'
       ? `${APP_BASE_URL}/events/${id}`
       : null
   }
   ```

Registered in `server/src/index.ts` alongside other public routes (no auth
middleware applied to this route).

### 5. Requester Status Page (`client/src/pages/RequesterStatus.tsx`)
New React page, fully public (no `AppLayout` wrapper, no auth check).
Reads `:id` from `useParams()` and `token` from `useSearchParams()`.
Fetches `GET /api/requests/:id/status?token=` on mount.

States rendered:
- Loading spinner
- 403 → "Access denied. This link may be invalid."
- 404 → "Request not found."
- Success → status card with class title, status badge, confirmed date
  (or "TBD"), registration count, and conditional "View Event Page" link.

Route added to `App.tsx` **outside** `AppLayout` (same pattern as
`/events/:requestId`):
```tsx
<Route path="/requests/:id" element={<RequesterStatus />} />
```

### 6. Post-Verification Redirect and Status Page Link
After the requester clicks the verify link in their email, the server redirects
them to `/requests/:id?token=:registrationToken`. This page shows the status URL
so the requester can bookmark it. No changes are needed to any email template —
the status URL is surfaced only on this post-verification confirmation page.

The `registrationToken` (which already exists on `EventRequest` and is used to
gate the public event registration page) is used as the access token for the
status page. This token is generated when the request moves from `unverified` to
`new` (i.e., at the moment of verification). One token, one shareable URL —
consistent with the spec's "obscure URLs sent in email" design.

## Why

- Content 404 and empty seed database directly break the intake form for
  any new developer or tester, creating a poor first-run experience.
- The analytics page was built in Sprint 005 but never linked from the nav,
  making it effectively invisible to admins.
- The `requester-registration-visibility.md` TODO has been open since Sprint 3.
  Requesters currently have no self-service way to track event progress —
  they must wait for email notifications. A tokenized status page resolves
  this with zero auth complexity.

## Impact on Existing Components

| Component | Impact |
|-----------|--------|
| `ContentService` | None — fixture expands, service unchanged |
| `seed.ts` | Rewritten to be adapter-aware; existing channel upsert preserved |
| `AppLayout.tsx` | One nav entry added to static array |
| `email.service.ts` | No changes — post-verification redirect surfaces the status URL instead |
| `App.tsx` | One new `<Route>` outside `AppLayout` |
| All existing tests | No changes expected — no existing interfaces modified |

## Migration Concerns

None. No schema changes. The seed script is dev-only. The new status API
route is additive. The nav change is purely client-side.

## Decisions

1. **Where is the status URL surfaced? (answered: Option C)**
   The requester status page URL (`/requests/:id?token=:registrationToken`) is
   shown only on the post-verification confirmation page — the page the requester
   lands on after clicking the verify link in their email. After verifying, the
   server redirects to `/requests/:id?token=:registrationToken`. The requester
   must bookmark this URL. No email template changes are needed.

2. **Which token gates the status page? (answered: Option B — registrationToken)**
   The `registrationToken` field already on `EventRequest` is used as the access
   token for `/requests/:id`. This token is generated when the request transitions
   from `unverified` to `new` (i.e., at verification time). It already gates the
   public event registration page, so reusing it keeps the URL surface area small
   and consistent with the spec's "obscure URL" design. No schema changes required.
