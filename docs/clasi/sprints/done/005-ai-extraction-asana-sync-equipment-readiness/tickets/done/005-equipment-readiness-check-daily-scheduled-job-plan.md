---
ticket: "005"
sprint: "005"
status: in-progress
---

# Plan: equipment-readiness-check daily scheduled job

## Approach

1. Add `equipmentReadinessCheck()` method to `EquipmentService`.
2. Look at existing scheduler pattern to understand how to register jobs.
3. Register the job in SchedulerService as a daily job.
4. Wire the job in the scheduler execution path.
5. Write tests for the job logic.

## Files to change

- `server/src/services/equipment.service.ts` — add `equipmentReadinessCheck()` method
- `server/src/services/scheduler.service.ts` — register equipment-readiness-check job
- `server/src/jobs/` (or similar) — add job handler
- `tests/server/equipment-readiness-job.test.ts` — new tests
