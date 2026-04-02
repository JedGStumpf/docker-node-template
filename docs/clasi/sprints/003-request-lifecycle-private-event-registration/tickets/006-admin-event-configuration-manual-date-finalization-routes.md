---
id: "006"
title: "Admin event configuration & manual date finalization routes"
status: todo
use-cases: [SUC-005]
depends-on: [004]
github-issue: ""
todo: ""
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Admin event configuration & manual date finalization routes

## Description

Add two new admin endpoints to `server/src/routes/admin/requests.ts` for event configuration and manual date finalization.

**Routes:**

1. `PUT /api/admin/requests/:id` — Update event configuration fields. Admin can set:
   - `minHeadcount` (Int, ≥ 1)
   - `votingDeadline` (ISO DateTime, must be in the future)
   - `eventType` (`"private"` or `"public"`)
   - `proposedDates` (array of ISO DateTime strings — only allowed when request is in `discussing` or `dates_proposed` status)

   This route updates the EventRequest fields directly (no state transition involved). Returns the updated request.

2. `POST /api/admin/requests/:id/finalize-date` — Manually finalize a date for an event. Accepts `{ date }` where `date` is an ISO DateTime string. The specified date must be one of the request's `proposedDates`; otherwise returns 422. Request must be in `dates_proposed` status; otherwise returns 422. Delegates to `RegistrationService.finalizeDate()` which uses the same transaction/guard logic as auto-finalization (ticket 004). Admin can finalize any proposed date regardless of whether it meets the headcount threshold.

**Auth:** Both routes require admin session (existing `requireAdmin` middleware).

## Acceptance Criteria

- [ ] `PUT /api/admin/requests/:id` updates `minHeadcount`, `votingDeadline`, `eventType` fields
- [ ] `PUT /api/admin/requests/:id` validates `minHeadcount ≥ 1`, `votingDeadline` in future, `eventType` is valid enum
- [ ] `PUT /api/admin/requests/:id` allows `proposedDates` update only when status is `discussing` or `dates_proposed`
- [ ] `POST /api/admin/requests/:id/finalize-date` with valid proposed date finalizes the event
- [ ] `POST /api/admin/requests/:id/finalize-date` with date not in `proposedDates` returns 422
- [ ] `POST /api/admin/requests/:id/finalize-date` when request not in `dates_proposed` returns 422
- [ ] Manual finalization triggers same side effects as auto-finalization (iCal, notifications, registrant status updates)
- [ ] Both routes require admin authentication (401/403 for unauthorized)
- [ ] Admin can finalize a date even if headcount threshold is not met

## Testing

- **Existing tests to run**: `tests/server/admin-requests.test.ts`, `tests/server/admin-requests-v2.test.ts`
- **New tests to write**: `tests/server/date-finalization.test.ts` (extends from ticket 004) — manual finalization happy path, date not in proposed dates 422, wrong status 422, admin can override threshold, same side effects as auto; `tests/server/admin-requests-v2.test.ts` — extend with event config update tests
- **Verification command**: `npm run test:server`
