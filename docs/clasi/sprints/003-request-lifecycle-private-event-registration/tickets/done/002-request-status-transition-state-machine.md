---
id: '002'
title: Request status transition state machine
status: done
use-cases:
- SUC-001
- SUC-002
depends-on:
- 1
github-issue: ''
todo: ''
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Request status transition state machine

## Description

Implement validated status transitions for `EventRequest` through the full lifecycle. Add a `VALID_TRANSITIONS` map and `transitionStatus()` method to `RequestService`. Refactor the existing `PUT /api/admin/requests/:id/status` route to delegate to the state machine instead of doing a direct Prisma update.

**Valid transitions:**
- `new → discussing` — no side effects
- `new → cancelled` — trigger cancellation notification (wired in ticket 003)
- `discussing → dates_proposed` — generate `registrationToken` (256-bit hex via `crypto.randomBytes`), store `proposedDates`, set defaults for `minHeadcount` (env `DEFAULT_MIN_HEADCOUNT`, default 10) and `votingDeadline` (env `DEFAULT_VOTING_DEADLINE_DAYS`, default 7 days from now) if not provided
- `discussing → cancelled` — trigger cancellation notification
- `dates_proposed → confirmed` — set `confirmedDate`, update registrant statuses (wired by ticket 004)
- `dates_proposed → cancelled` — trigger cancellation to all registrants + participants
- `confirmed → completed` — no side effects
- `confirmed → cancelled` — trigger cancellation to confirmed registrants + participants

**Terminal states:** `completed`, `cancelled` — no transitions out.

**Idempotency:** If current status == new status, return current record without error. Invalid transitions throw `ValidationError` (422).

**Route refactor:** Replace the `allowedStatuses` set and direct `prisma.eventRequest.update()` in `PUT /api/admin/requests/:id/status` with a call to `RequestService.transitionStatus()`. The route body accepts `{ status, proposedDates?, minHeadcount?, votingDeadline? }`.

## Acceptance Criteria

- [x] `RequestService.VALID_TRANSITIONS` static map covers all transitions above
- [x] `RequestService.transitionStatus(requestId, newStatus, data?)` validates transitions and applies side effects
- [x] Invalid transitions (e.g., `new → confirmed`) throw `ValidationError` returning 422
- [x] Transition to `dates_proposed` generates a unique `registrationToken` (64-char hex)
- [x] Transition to `dates_proposed` stores `proposedDates` on the EventRequest
- [x] Transition to `dates_proposed` sets default `minHeadcount` and `votingDeadline` when not provided
- [x] Idempotent: calling with current status returns 200 without error
- [x] `PUT /api/admin/requests/:id/status` delegates to `transitionStatus()` — no direct Prisma update
- [x] Cancellation from `new`, `discussing`, `dates_proposed`, `confirmed` all succeed
- [x] Cancellation from `completed` or `cancelled` returns 422
- [x] Existing admin request tests still pass

## Testing

- **Existing tests to run**: `tests/server/admin-requests.test.ts`, `tests/server/admin-requests-v2.test.ts`
- **New tests to write**: `tests/server/request-lifecycle.test.ts` — valid transitions succeed (200), invalid transitions return 422, `registrationToken` generated on `dates_proposed`, `proposedDates` stored, idempotent re-transition, cancellation from each non-terminal status
- **Verification command**: `npm run test:server`
