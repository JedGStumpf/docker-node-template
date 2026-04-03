---
id: "005"
title: "equipment-readiness-check daily scheduled job"
status: todo
use-cases:
  - SUC-006
depends-on:
  - "003"
  - "004"
github-issue: ""
todo: ""
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# equipment-readiness-check daily scheduled job

## Description

Register a new daily scheduled job `equipment-readiness-check` in the existing `SchedulerService` (Sprint 3). Add an `equipmentReadinessCheck()` function to `EquipmentService` that is called by the job.

### Job logic: `EquipmentService.equipmentReadinessCheck()`

1. Query all `InstructorAssignment` rows where `equipmentStatus = "pending_checkout"` AND assignment status is not `cancelled`. Use `FOR UPDATE SKIP LOCKED` on PostgreSQL (same concurrency pattern as `email-sender`). On SQLite, natural single-writer lock applies.
2. For each assignment:
   a. Load `inventoryUserId` from `InstructorProfile`. If null: log warning, skip.
   b. Call `inventoryClient.getCheckouts(inventoryUserId)`. If throws: log error, skip (do not change status).
   c. Recompute `itemsStillNeeded` against class requirements.
   d. If now empty: set `equipmentStatus = "ready"`, `equipmentCheckedAt = now()`, enqueue `equipment-ready` email.
   e. If still incomplete: increment `equipmentReminderCount`, set `equipmentCheckedAt = now()`, compute `daysUntilEvent`, enqueue `equipment-checkout-reminder` email.
3. Log summary: N processed, M transitioned to ready, K reminded.

### Scheduler registration
- Register in `SchedulerService` as a daily job (runs once per day).
- Job name: `"equipment-readiness-check"`.
- Follow the existing `ScheduledJob` registration pattern from Sprint 3.

## Acceptance Criteria

- [ ] Job is registered with frequency = daily in `SchedulerService`.
- [ ] `equipmentReadinessCheck()` transitions `pending_checkout` assignments to `ready` when stub returns complete inventory.
- [ ] `equipmentReadinessCheck()` increments `equipmentReminderCount` and enqueues reminder email when inventory is still incomplete.
- [ ] Cancelled assignments are not processed.
- [ ] Assignments with null `inventoryUserId` are skipped (logged, not errored).
- [ ] `npm run test:server` passes green.

## Testing

- **Existing tests to run**: `npm run test:server`
- **New tests to write**: `tests/server/equipment-readiness-job.test.ts`
  - Seed `pending_checkout` assignments, call `equipmentReadinessCheck()` directly, assert status transitions and `EmailQueue` rows.
  - Test cancelled assignment is not processed.
  - Test `equipmentReminderCount` increments on repeated runs.
- **Verification command**: `npm run test:server`
