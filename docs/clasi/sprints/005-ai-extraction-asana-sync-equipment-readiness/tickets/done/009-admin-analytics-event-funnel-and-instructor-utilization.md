---
id: "009"
title: "Admin analytics: event funnel and instructor utilization"
status: done
use-cases: []
depends-on:
  - "001"
github-issue: ""
todo: ""
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Admin analytics: event funnel and instructor utilization

## Description

Implement `AnalyticsService` and an admin analytics dashboard page.

### `AnalyticsService` (`server/src/services/analytics.service.ts`)

Read-only service. Uses Prisma aggregation (no raw SQL).

**`getEventFunnel(period?: { from: Date, to: Date }): Promise<EventFunnel>`**
- Counts `EventRequest` rows grouped by `status`. Returns:
```json
{
  "unverified": 5,
  "new": 12,
  "discussing": 8,
  "confirmed": 6,
  "completed": 4,
  "cancelled": 3,
  "total": 38
}
```

**`getInstructorUtilization(period?: { from: Date, to: Date }): Promise<InstructorUtilization[]>`**
- Groups `InstructorAssignment` by instructor, counts accepted/declined/pending assignments.
- Returns array of `{ instructorId, displayName, accepted, declined, pending, total }`.

**`getRegistrationCounts(period?: { from: Date, to: Date }): Promise<RegistrationSummary>`**
- Counts registrations by status (confirmed, waitlisted, cancelled).
- Includes total kid count from confirmed registrations.

### API: `GET /api/admin/analytics`

- Auth: admin only.
- Query params: `from` (ISO date), `to` (ISO date) — optional, default last 90 days.
- Returns all three metrics in a single response.

### React: Admin analytics page

New page in the admin dashboard at `/admin/analytics`:
- Event funnel: horizontal bar chart or table showing requests by status.
- Instructor utilization: sortable table (instructor name, accepted, declined, pending).
- Registration summary: counts and total kids.
- Date range picker (from/to) that triggers a re-fetch.

### ServiceRegistry
- Add `analytics: AnalyticsService`.

## Acceptance Criteria

- [x] `GET /api/admin/analytics` returns all three metric groups.
- [x] `GET /api/admin/analytics` returns 403 for non-admin callers.
- [x] Period filtering works (from/to query params).
- [x] Default period is last 90 days when no params provided.
- [x] Admin analytics page renders event funnel, utilization table, and registration summary.
- [x] `npm run test:server` and `npm run test:client` pass green.

## Testing

- **Existing tests to run**: `npm run test:server`, `npm run test:client`
- **New tests to write**:
  - `tests/server/analytics.test.ts` — seed known data, call `GET /api/admin/analytics`, assert correct counts. Test period filtering. Test admin auth guard.
  - `tests/client/AnalyticsDashboard.test.tsx` — component renders with fixture data; date picker triggers re-fetch.
- **Verification command**: `npm run test:server && npm run test:client`
