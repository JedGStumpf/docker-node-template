---
id: 009
title: Instructor matching & consent flow
status: done
use-cases:
- SUC-006
- SUC-007
depends-on:
- '006'
- 008
github-issue: ''
todo: ''
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Instructor matching & consent flow

## Description

Implement the full instructor consent lifecycle: accept/decline endpoints (tokenized URL links from notification emails), the reminder/timeout background job, and the advance-to-next-instructor logic on decline or timeout. After a request is verified, the system has created `InstructorAssignment` records in `pending` status (from ticket 008). This ticket adds the logic for what happens next: instructors respond, time out, or are skipped.

## Acceptance Criteria

- [x] `POST /api/instructor/assignments/:id/accept` with a valid `notificationToken` sets `InstructorAssignment.status = accepted`, sets `respondedAt`, and returns 200
- [x] `POST /api/instructor/assignments/:id/decline` with a valid `notificationToken` sets status to `declined`, then finds the next ranked candidate, creates a new `InstructorAssignment`, and dispatches a new match notification email
- [x] Both accept/decline endpoints return 400 for an invalid token and 404 for an unknown assignment ID
- [x] Both endpoints are idempotent: calling accept on an already-accepted assignment returns 200 without side effects
- [x] `InstructorService.sendReminders()` sends a reminder email to instructors with `pending` assignments where `notifiedAt` (or `lastReminderAt`) is older than `INSTRUCTOR_REMINDER_INTERVAL_HOURS` (default 8h) and `reminderCount < max_reminders`
- [x] `sendReminders()` marks an assignment `timed_out` when elapsed time since first notification exceeds `INSTRUCTOR_TIMEOUT_HOURS` (default 24h), then advances to the next instructor
- [x] When no further candidates exist for a request (all have declined or timed out), `EmailService.sendAdminNewRequestNotification` is called with a `no_match_available` flag
- [x] The reminder/timeout job is registered at server startup with interval `REMINDER_INTERVAL_MS`; not registered in `NODE_ENV=test`

## Testing

- **Existing tests to run**: `npm run test:server`
- **New tests to write**: `tests/server/consent-flow.test.ts` — accept (happy path, idempotent, bad token), decline (status change + next instructor created + notification email), timeout path (call `sendReminders` with manipulated timestamps, assert timed_out + next assignment), no-more-candidates (admin notified).
- **Verification command**: `npm run test:server`

## Implementation Notes

- Token validation: `notificationToken` is a UUID stored on the `InstructorAssignment`. Validate by looking up the assignment by ID then comparing the token. Do NOT use the token alone as a lookup key to prevent timing attacks — look up by ID first.
- "Next instructor" logic: query `MatchingService` with the same `{ zip, classSlug }` from the original request, exclude all instructors who already have an `InstructorAssignment` for this request (regardless of status), take the first result.
- Route file: `server/src/routes/instructor.ts` (extend with assignment routes).
- `max_reminders` = `Math.floor(INSTRUCTOR_TIMEOUT_HOURS / INSTRUCTOR_REMINDER_INTERVAL_HOURS)` — derived, not a separate config.
