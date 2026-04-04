---
id: "008"
title: "Admin equipment status UI and instructor dashboard"
status: done
use-cases:
  - SUC-007
  - SUC-008
depends-on:
  - "003"
  - "004"
github-issue: ""
todo: ""
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Admin equipment status UI and instructor dashboard

## Description

Add two new React views and a supporting API route for the instructor dashboard.

### Admin Request Detail: Equipment Status Section

Extend the existing admin request detail view to include an equipment status section below the instructor assignment list.

**Per assignment, show:**
- Equipment status badge: `ready` (green), `pending_checkout` (yellow), `unknown` (gray).
- `equipmentCheckedAt` timestamp.
- `equipmentReminderCount` (if > 0).
- "Override" button → opens a modal with status select (ready / unknown) and optional note field. Calls `POST /api/assignments/:id/equipment-status/override`.

**`GET /api/admin/requests/:id`** — extend response to include equipment status fields on each `InstructorAssignment`.

### Instructor Dashboard: `GET /api/instructor/events`

New API route (instructor-only auth):
- Returns upcoming assignments (event date ≥ today, sorted ascending) and past assignments (event date < today, last 12 months, sorted descending).
- Each assignment includes: class name, event date, venue/location, confirmation status, `equipmentStatus`, `equipmentCheckedAt`.

### React: `/instructor/events` page

New React route at `/instructor/events`:
- Two sections: "Upcoming Events" and "Past Events".
- Each assignment card shows: class name, date, location, status badge, equipment status badge.
- Empty state for each section.
- Auth guard: redirects unauthenticated users to Pike13 login.

## Acceptance Criteria

- [x] Admin request detail shows equipment status badge for each assignment.
- [x] All three badge states (ready, pending_checkout, unknown) render with correct colors.
- [x] Override modal submits to the override API and refreshes the status.
- [x] `GET /api/instructor/events` returns upcoming and past assignments for the authenticated instructor.
- [x] `/instructor/events` page renders both sections and empty states.
- [x] `/instructor/events` redirects unauthenticated visitors to login.
- [x] `npm run test:server` and `npm run test:client` pass green.

## Testing

- **Existing tests to run**: `npm run test:server`, `npm run test:client`
- **New tests to write**:
  - `tests/server/instructor-events.test.ts` — route test for `GET /api/instructor/events` (happy path, auth guard, empty results).
  - `tests/client/InstructorDashboard.test.tsx` — component renders assignment list with equipment badges; empty state renders.
  - `tests/client/EquipmentStatusBadge.test.tsx` — renders all three status states.
- **Verification command**: `npm run test:server && npm run test:client`
