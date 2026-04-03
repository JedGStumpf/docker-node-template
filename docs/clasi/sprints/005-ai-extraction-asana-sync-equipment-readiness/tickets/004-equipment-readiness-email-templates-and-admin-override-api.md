---
id: "004"
title: "Equipment readiness email templates and admin override API"
status: todo
use-cases:
  - SUC-005
  - SUC-007
depends-on:
  - "003"
github-issue: ""
todo: ""
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Equipment readiness email templates and admin override API

## Description

### Email templates (added to EmailService)

Three new email templates, added as methods on `EmailService` (or as named template functions following the project's existing pattern):

**`sendEquipmentReadyEmail(assignment, instructor, eventRequest)`**
- Subject: `You're all set for [class name] on [date]`
- Body: Confirms the instructor has all required equipment already checked out. Lists the items.

**`sendEquipmentCheckoutPromptEmail(assignment, instructor, eventRequest, itemsNeeded)`**
- Subject: `Action needed: check out equipment for [class name] on [date]`
- Body: Lists specific items still needed with quantities. Includes a direct link to the inventory checkout system (`INVENTORY_CHECKOUT_URL` env var, graceful if not set).

**`sendEquipmentCheckoutReminderEmail(assignment, instructor, eventRequest, itemsNeeded, daysUntilEvent)`**
- Subject: `Reminder ([N] days until event): check out equipment for [class name]`
- Body: Same as prompt but with days-until-event for urgency. Includes `equipment_reminder_count` context.

All three emails are enqueued via `EmailQueueService` (not sent directly).

### Admin override API: `POST /api/assignments/:id/equipment-status/override`

- Auth: admin only.
- Request body: `{ "status": "ready" | "unknown", "note": string? }`
- Sets `equipmentStatus` on the assignment to the provided value.
- Logs the override with admin identity and optional note.
- If overriding to `"ready"`: stops any active reminder loop (handled by checking `equipmentStatus != "pending_checkout"` in the daily job).
- Returns: `{ id, equipmentStatus, overriddenAt, overriddenBy }`

### New env var
- `INVENTORY_CHECKOUT_URL` — optional, URL to the inventory checkout system. Used in email templates. If not set, prompt emails omit the link (no broken URL).

## Acceptance Criteria

- [ ] `equipment-ready` email is enqueued with correct subject and body when status = ready.
- [ ] `equipment-checkout-prompt` email lists items still needed and includes checkout link if `INVENTORY_CHECKOUT_URL` is set.
- [ ] `equipment-checkout-prompt` email omits the link gracefully if `INVENTORY_CHECKOUT_URL` is not set.
- [ ] `equipment-checkout-reminder` email includes days-until-event.
- [ ] `POST /api/assignments/:id/equipment-status/override` sets `equipmentStatus` for admin.
- [ ] Override endpoint returns 403 for non-admin callers.
- [ ] Override to `"ready"` stops the reminder loop (daily job skips `"ready"` assignments).
- [ ] `npm run test:server` passes green.

## Testing

- **Existing tests to run**: `npm run test:server`
- **New tests to write**:
  - `tests/server/equipment-override.test.ts` — route tests for `POST /api/assignments/:id/equipment-status/override` (happy path, non-admin 403, invalid status 400).
  - Email template content verified in `tests/server/equipment.service.test.ts` (inspect `EmailQueue` rows).
- **Verification command**: `npm run test:server`
