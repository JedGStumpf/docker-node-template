---
ticket: "008"
sprint: "005"
status: in-progress
---

# Plan: Admin equipment status UI and instructor dashboard

## Approach

1. Add `GET /api/instructor/events` route to instructor router.
2. Create `EquipmentStatusBadge` React component.
3. Create `InstructorDashboard` page at `/instructor/events`.
4. Write server and client tests.

Note: Admin request detail already includes equipment status via existing assignment data
(equipmentStatus, equipmentCheckedAt, equipmentReminderCount were added to the DB in ticket 001).
The GET /api/admin/requests/:id already includes assignments with instructor data.
The override endpoint was added in ticket 004.

## Files to create/change

- `server/src/routes/instructor.ts` — add GET /api/instructor/events
- `client/src/components/EquipmentStatusBadge.tsx` — new component
- `client/src/pages/InstructorDashboard.tsx` — new page
- `client/src/App.tsx` — add route for /instructor/events
- `tests/server/instructor-events.test.ts` — route tests
- `tests/client/InstructorDashboard.test.tsx` — component tests
- `tests/client/EquipmentStatusBadge.test.tsx` — badge component tests
