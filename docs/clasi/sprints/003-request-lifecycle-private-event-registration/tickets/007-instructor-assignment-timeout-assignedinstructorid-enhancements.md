---
id: "007"
title: "Instructor assignment timeout & assignedInstructorId enhancements"
status: todo
use-cases: [SUC-008]
depends-on: [001]
github-issue: ""
todo: ""
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Instructor assignment timeout & assignedInstructorId enhancements

## Description

Modify `InstructorService` and `RequestService` to use the new `timeoutAt` field on `InstructorAssignment` and the `assignedInstructorId` field on `EventRequest`. These changes complete the instructor assignment lifecycle that was started in Sprint 1.

**Changes to `InstructorService`:**

1. `advanceToNextInstructor()` — When creating a new `InstructorAssignment`, set `timeoutAt` to `new Date(Date.now() + timeoutHours * 3600_000)` where `timeoutHours` comes from env `ASSIGNMENT_TIMEOUT_HOURS` (default 48).

2. `handleAssignmentResponse()` — When an instructor accepts (response === `'accept'`), set `assignedInstructorId` on the parent `EventRequest` to the instructor's `id`. This is a denormalization for quick lookup — the `InstructorAssignment` join table remains the source of truth.

3. `sendReminders()` — Update the reminder query to use `timeoutAt` for the timeout check instead of the current arithmetic-based approach. An assignment is timed out when `timeoutAt < now` and `status === 'pending'`. When timing out, set `status: 'timed_out'` and call `advanceToNextInstructor()`. If no next candidate exists, notify admin.

**Changes to `RequestService`:**

4. `verifyRequest()` — The existing flow that creates the first `InstructorAssignment` (via `MatchingService`) must also set `timeoutAt` on the new assignment.

**Environment variables:**
- `ASSIGNMENT_TIMEOUT_HOURS` — default 48
- `REMINDER_INTERVAL_HOURS` — default 24 (already used by existing `sendReminders`)

## Acceptance Criteria

- [ ] New `InstructorAssignment` records have `timeoutAt` set to `now + ASSIGNMENT_TIMEOUT_HOURS`
- [ ] `advanceToNextInstructor()` sets `timeoutAt` on the new assignment
- [ ] `handleAssignmentResponse('accept')` sets `assignedInstructorId` on EventRequest
- [ ] `sendReminders()` uses `timeoutAt` for timeout detection
- [ ] Timed-out assignments get `status: timed_out` and advance to next instructor
- [ ] If no next instructor candidate exists, admin is notified
- [ ] `verifyRequest()` sets `timeoutAt` on the initial assignment
- [ ] Existing consent flow and instructor matching tests still pass

## Testing

- **Existing tests to run**: `tests/server/consent-flow.test.ts`, `tests/server/auth.test.ts`
- **New tests to write**: `tests/server/assignment-reminders.test.ts` — reminder sent for pending assignments past `REMINDER_INTERVAL_HOURS`, `reminderCount` incremented, timeout sets `timed_out` and advances to next instructor, no reminder for already-responded assignments, admin notified when no candidates remain
- **Verification command**: `npm run test:server`
