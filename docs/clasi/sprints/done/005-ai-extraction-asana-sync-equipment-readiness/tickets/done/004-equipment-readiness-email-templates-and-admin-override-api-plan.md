---
ticket: "004"
sprint: "005"
status: in-progress
---

# Plan: Equipment readiness email templates and admin override API

## Approach

1. Add three email methods to `EmailService`: sendEquipmentReady, sendEquipmentCheckoutPrompt, sendEquipmentCheckoutReminder.
2. Update `EquipmentService.checkReadiness()` to use these named methods instead of raw enqueue calls.
3. Add admin override route: `POST /api/assignments/:id/equipment-status/override`.
4. Write tests for override route and email queue content.

## Files to change

- `server/src/services/email.service.ts` — add equipment email methods
- `server/src/services/equipment.service.ts` — use named email methods
- `server/src/routes/admin/requests.ts` — add override route, or new admin routes file
- `tests/server/equipment-override.test.ts` — new route tests
