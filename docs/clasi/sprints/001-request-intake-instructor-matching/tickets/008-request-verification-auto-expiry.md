---
id: 008
title: Request verification & auto-expiry
status: done
use-cases:
- SUC-003
- SUC-004
depends-on:
- '007'
github-issue: ''
todo: ''
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Request verification & auto-expiry

## Description

Implement `RequestService.verifyRequest` (token check, 1-hour window, status transition to `new`), the `POST /api/requests/:id/verify` route, and the background expiry job (`RequestService.expireUnverified`). When a request is successfully verified, it triggers instructor matching and queues match notification emails (the full consent flow is in ticket 009; this ticket ensures the transition to `new` status fires the match event).

## Acceptance Criteria

- [x] `POST /api/requests/:id/verify` with valid token and within the 1-hour window returns 200 + `{ status: "new" }`
- [x] `POST /api/requests/:id/verify` with a valid token but past `verificationExpiresAt` returns 410 (Gone) with an `expired` error code
- [x] `POST /api/requests/:id/verify` with an incorrect token returns 400
- [x] `POST /api/requests/:id/verify` for an unknown request ID returns 404
- [x] `POST /api/requests/:id/verify` on an already-`new` request returns 200 (idempotent)
- [x] After successful verification, `EventRequest.status` is `new` in the database
- [x] `RequestService.expireUnverified()` deletes all `EventRequest` records in `unverified` status where `verificationExpiresAt < now()`
- [x] The expiry job does NOT delete requests in `new` or later statuses
- [x] Background expiry job is registered at server startup with interval `REQUEST_EXPIRY_INTERVAL_MS`; job is not registered when `NODE_ENV=test`

## Testing

- **Existing tests to run**: `npm run test:server`
- **New tests to write**: `tests/server/request-verification.test.ts` — valid verify (status becomes new), expired token (410), wrong token (400), unknown ID (404), idempotent re-verify; `expireUnverified` unit test (seed unverified + new records, call method, assert only unverified past expiry are deleted).
- **Verification command**: `npm run test:server`

## Implementation Notes

- The `verifyRequest` method sets `status = 'new'` and calls `MatchingService.findMatchingInstructors` to get candidates; it stores them as `InstructorAssignment` records (status `pending`) and fires `EmailService.sendMatchNotification` for each. The full consent logic (reminders, timeout, decline) is in ticket 009.
- Use database time for expiry check (`verificationExpiresAt < NOW()`) not process time, to avoid clock skew issues.
- Route file: extend `server/src/routes/requests.ts`.
