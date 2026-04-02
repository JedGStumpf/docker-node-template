---
id: "008"
title: "Scheduled jobs — assignment reminders, registration digest, deadline check"
status: done
use-cases: [SUC-008, SUC-009]
depends-on: [003, 004, 007]
github-issue: ""
todo: ""
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Scheduled jobs — assignment reminders, registration digest, deadline check

## Description

Register three new scheduled jobs with `SchedulerService` at app startup. Each job has a handler that is invoked by the scheduler's tick loop. Existing `SchedulerService` pattern: `registerHandler(jobName, handler)` + `seedDefaults()` creates the `ScheduledJob` DB records.

**Jobs:**

1. **`assignment-reminders`** (hourly) — Finds `InstructorAssignment` records with `status: pending` past the reminder threshold (`REMINDER_INTERVAL_HOURS`, default 24). Sends `EmailService.sendMatchReminder()` and increments `reminderCount`. For assignments where `timeoutAt < now`, sets `status: timed_out` and calls `InstructorService.advanceToNextInstructor()`. If no next candidate, notifies admin. This largely wires together the existing `InstructorService.sendReminders()` method (enhanced in ticket 007) as a scheduler handler.

2. **`registration-digest`** (daily) — Finds `EventRequest` records in `dates_proposed` status with at least one registration. For each, calls `RegistrationService.generateDigest()` to produce the summary HTML, then sends via `EmailService.sendRegistrationDigest()` to the request's `emailThreadAddress`. Skips requests without `emailThreadAddress`. Skips requests with 0 registrations.

3. **`deadline-check`** (hourly) — Finds `EventRequest` records in `dates_proposed` where `votingDeadline < now`. For each, runs `RegistrationService.checkAndFinalizeThreshold()`. If no date meets `minHeadcount`, sends `EmailService.sendDeadlineExpiredNotification()` to the requester and admin. The request remains in `dates_proposed` — admin must manually cancel or reschedule.

**Startup wiring:** In `server/src/index.ts` (or wherever `seedDefaults` is called), add the three new handler registrations and extend `seedDefaults()` to create the DB job records with appropriate frequencies.

## Acceptance Criteria

- [x] `assignment-reminders` handler registered and seeded as hourly job
- [x] `registration-digest` handler registered and seeded as daily job
- [x] `deadline-check` handler registered and seeded as hourly job
- [x] Assignment reminders: sends reminder for pending assignments past threshold, increments `reminderCount`
- [x] Assignment reminders: times out stale assignments and advances to next instructor
- [x] Assignment reminders: notifies admin when no candidates remain
- [x] Registration digest: generates correct summary for events in `dates_proposed`
- [x] Registration digest: skips events without `emailThreadAddress` or 0 registrations
- [x] Registration digest: sends summary to the email thread address
- [x] Deadline check: finds expired-deadline requests and runs threshold check
- [x] Deadline check: sends deadline-expired notification when no date meets threshold
- [x] Deadline check: does NOT affect requests with future deadline or already-confirmed requests
- [x] Existing backup jobs (`daily-backup`, `weekly-backup`) are unaffected

## Testing

- **Existing tests to run**: `tests/server/admin-scheduler.test.ts`
- **New tests to write**: `tests/server/assignment-reminders.test.ts` (extends from ticket 007) — handler invocation tests; `tests/server/registration-digest.test.ts` — digest generated, sent to thread, skips ineligible events; `tests/server/date-finalization.test.ts` (extends) — deadline expiry notification, requests with future deadline unaffected. All tests invoke handlers directly, not via timer intervals.
- **Verification command**: `npm run test:server`
