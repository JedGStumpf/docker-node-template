---
ticket: "009"
sprint: "005"
status: in-progress
---

# Plan: Admin analytics — event funnel and instructor utilization

## Approach

1. Create `AnalyticsService` with getEventFunnel, getInstructorUtilization, getRegistrationCounts.
2. Add `GET /api/admin/analytics` route.
3. Add analytics to ServiceRegistry.
4. Create admin analytics React page at `/admin/analytics`.
5. Write server and client tests.

## Files to create/change

- `server/src/services/analytics.service.ts` — new service
- `server/src/services/service.registry.ts` — add analytics service
- `server/src/routes/admin/analytics.ts` — new admin route
- `server/src/routes/admin/index.ts` — register analytics router
- `client/src/pages/admin/AnalyticsDashboard.tsx` — new page
- `client/src/App.tsx` — add route
- `tests/server/analytics.test.ts`
- `tests/client/AnalyticsDashboard.test.tsx`
