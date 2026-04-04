---
id: "003"
title: "EquipmentService: readiness check on instructor acceptance"
status: done
use-cases:
  - SUC-005
depends-on:
  - "001"
  - "002"
github-issue: ""
todo: ""
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# EquipmentService: readiness check on instructor acceptance

## Description

Implement `EquipmentService` at `server/src/services/equipment.service.ts`. This service handles the equipment readiness check triggered when an instructor accepts an assignment.

### Core logic: `checkReadiness(assignmentId: string): Promise<void>`

1. Load the `InstructorAssignment` and its related `InstructorProfile` and `EventRequest`.
2. If `instructorProfile.inventoryUserId` is null: set `equipmentStatus = "unknown"`, log a warning, return.
3. Load `equipmentNeeded` from `ContentService.getClassContent(classSlug)`. Parse the string best-effort into `[{ item_type, quantity }]` items. If parsing fails or field is absent: set `equipmentStatus = "unknown"`, log a warning, return.
4. Call `inventoryClient.getCheckouts(inventoryUserId)`. If the call throws: set `equipmentStatus = "unknown"`, log the error, return.
5. Compute `itemsStillNeeded` = required items minus already checked out (by `item_type`, quantity delta).
6. If `itemsStillNeeded` is empty:
   - Set `equipmentStatus = "ready"`, set `equipmentCheckedAt = now()`.
   - Enqueue `equipment-ready` email via `EmailQueueService`.
7. If `itemsStillNeeded` is non-empty:
   - Set `equipmentStatus = "pending_checkout"`, set `equipmentCheckedAt = now()`.
   - Enqueue `equipment-checkout-prompt` email with the list of still-needed items and checkout link.

### Integration with InstructorService
- `InstructorService.acceptAssignment(assignmentId)` calls `equipmentService.checkReadiness(assignmentId)` asynchronously after updating assignment status to `accepted`. The check is fire-and-forget: errors are caught and logged, they do not fail the acceptance.

### API endpoint: `GET /api/assignments/:id/equipment-status`
- Auth: instructor (own assignment) or admin.
- Returns:
```json
{
  "status": "pending_checkout",
  "required": [{ "item_type": "EV3 Robot Kit", "quantity": 2 }],
  "checked_out": [{ "item_type": "EV3 Robot Kit", "quantity": 1 }],
  "still_needed": [{ "item_type": "EV3 Robot Kit", "quantity": 1 }],
  "last_checked_at": "2026-04-03T10:00:00Z",
  "reminder_count": 0
}
```

### ServiceRegistry
- Add `equipment: EquipmentService` instantiated with `defaultPrisma`, `this.inventoryClient`, `this.content`, and `this.emailQueue`.

## Acceptance Criteria

- [x] `checkReadiness()` sets `equipmentStatus = "ready"` and enqueues confirmation email when stub returns complete inventory.
- [x] `checkReadiness()` sets `equipmentStatus = "pending_checkout"` and enqueues prompt email when stub returns partial inventory.
- [x] `checkReadiness()` sets `equipmentStatus = "unknown"` (no email) when `inventoryUserId` is null.
- [x] `checkReadiness()` sets `equipmentStatus = "unknown"` (no email) when inventory client throws.
- [x] `InstructorService.acceptAssignment()` triggers the check asynchronously; errors do not propagate to caller.
- [x] `GET /api/assignments/:id/equipment-status` returns correct shape for all three statuses.
- [x] `GET /api/assignments/:id/equipment-status` returns 403 for a different instructor's assignment.
- [x] `npm run test:server` passes green.

## Testing

- **Existing tests to run**: `npm run test:server`
- **New tests to write**:
  - `tests/server/equipment.service.test.ts` — unit tests for all `checkReadiness()` paths using `StubInventoryClient`.
  - `tests/server/equipment-status.test.ts` — route tests for `GET /api/assignments/:id/equipment-status` (happy path, auth error, wrong instructor).
- **Verification command**: `npm run test:server`
