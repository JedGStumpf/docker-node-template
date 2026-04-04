---
id: "010"
title: "Edge cases: late participant additions, no-instructor-available workflow, Meetup group mapping, Give Lively donation link"
status: done
use-cases: []
depends-on:
  - "001"
github-issue: ""
todo: ""
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Edge cases: late participant additions, no-instructor-available workflow, Meetup group mapping, Give Lively donation link

## Description

Batch of polish and edge-case items deferred from earlier sprints.

### 1. Late participant additions

When a confirmed private event already has a finalized date, allow a new registration to be added without re-triggering the date voting flow.

- `RegistrationService.createRegistration()`: if `EventRequest.status === "confirmed"` and `confirmedDate` is already set, register directly (skip voting check). Capacity / waitlist logic still applies.
- Admin can also add a participant manually via `POST /api/admin/requests/:id/registrations`.

### 2. No-instructor-available workflow

When the instructor reminder cycle completes and no instructor has accepted (all declined or timed out), the system should alert admins rather than silently stalling.

- In `InstructorService` (or the reminder scheduler), after all instructors in the match set have declined or the reminder deadline passes: transition `EventRequest.status` to a new `"no_instructor"` value and send an admin alert email.
- Admin UI: show `"no_instructor"` as a distinct status with a yellow warning badge and a "Re-open matching" action that resets to `"discussing"` and re-notifies available instructors.

### 3. Meetup group mapping fallback logging

When `MeetupService.createMeetupEvent()` cannot find a group mapping for a class slug (no entry in `groups.json`):
- Log a structured warning: `{ classSlug, fallback: MEETUP_GROUP_URLNAME }`.
- Include the fallback group name used in the Meetup event description so admins can identify mismatches.
- Admin dashboard: add a "Meetup group mapping warnings" section showing recent fallback uses.

### 4. Give Lively donation link customization

Add an optional per-event donation link (Give Lively URL) to `EventRequest`.

- New field: `giveLivelyUrl` — String?, nullable, on `EventRequest`.
- Admin can set/clear it via the request detail edit form.
- When set: render the donation link in the public event page and in confirmation emails.
- Validation: must be a valid URL starting with `https://` if provided.

## Acceptance Criteria

- [x] Late registration on a confirmed event does not re-trigger date voting.
- [x] Late registration on a confirmed event at capacity is waitlisted correctly.
- [x] `EventRequest.status` transitions to `"no_instructor"` when all instructors decline/time out.
- [x] Admin receives an alert email when `"no_instructor"` status is set.
- [x] Admin UI shows `"no_instructor"` badge and "Re-open matching" action.
- [x] Meetup group mapping fallback logs a structured warning.
- [x] `giveLivelyUrl` is persisted and rendered in public event page and emails.
- [x] Invalid `giveLivelyUrl` (non-HTTPS URL) is rejected with 400.
- [x] `npm run test:server` passes green.

## Testing

- **Existing tests to run**: `npm run test:server`, `npm run test:client`
- **New tests to write**:
  - `tests/server/late-registration.test.ts` — confirm late registration bypasses voting; capacity/waitlist still applies.
  - `tests/server/no-instructor.test.ts` — simulate all instructors declining; assert status transition and admin alert email.
  - `tests/server/give-lively.test.ts` — set/clear `giveLivelyUrl` via admin API; assert validation.
- **Verification command**: `npm run test:server && npm run test:client`
