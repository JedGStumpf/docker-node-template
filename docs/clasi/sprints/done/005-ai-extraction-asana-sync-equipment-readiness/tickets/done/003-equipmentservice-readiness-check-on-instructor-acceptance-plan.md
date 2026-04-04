---
ticket: "003"
sprint: "005"
status: in-progress
---

# Plan: EquipmentService — readiness check on instructor acceptance

## Approach

1. Create `server/src/services/equipment.service.ts` with `checkReadiness()` method.
2. Parse `equipmentNeeded` string from ContentService best-effort into structured items.
3. Integrate with `InstructorService.acceptAssignment()` — fire-and-forget.
4. Add `GET /api/assignments/:id/equipment-status` route.
5. Add `equipment: EquipmentService` to `ServiceRegistry`.
6. Write tests for service logic and route.

## Files to create/change

- `server/src/services/equipment.service.ts` — new service
- `server/src/services/instructor.service.ts` — call checkReadiness after accept
- `server/src/services/service.registry.ts` — add equipment service
- `server/src/routes/assignments.ts` (or similar) — add equipment-status route
- `tests/server/equipment.service.test.ts`
- `tests/server/equipment-status.test.ts`
