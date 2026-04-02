---
sprint: "003"
status: draft
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Architecture Update — Sprint 003: Request Lifecycle & Private Event Registration

## What Changed

### Modified Prisma Models

**`EventRequest` additions:**
- `eventType` — String, default `"private"`. Values: `private`, `public`.
- `minHeadcount` — Int, nullable. Minimum kids required to run the event.
- `votingDeadline` — DateTime, nullable. Deadline for date voting.
- `confirmedDate` — DateTime, nullable. Set when a date is finalized.
- `registrationToken` — String, unique, nullable. Generated on transition to `dates_proposed`; used for public registration link.
- `proposedDates` — DateTime array, nullable. Set when admin moves request to `dates_proposed`.
- `assignedInstructorId` — FK to `InstructorProfile`, nullable. Set when an instructor accepts.

**`InstructorAssignment` additions:**
- `timeoutAt` — DateTime, nullable. Set on creation to `now + ASSIGNMENT_TIMEOUT_HOURS`.

### New Prisma Models

**`Registration`** — Tracks attendee registration for private events. Per spec §5.6:
- `id` — UUID, default auto.
- `requestId` — FK to `EventRequest`.
- `attendeeName` — String.
- `attendeeEmail` — String.
- `numberOfKids` — Int.
- `availableDates` — DateTime array. Which proposed dates the attendee can attend.
- `status` — String, default `"interested"`. Values: `interested`, `confirmed`, `declined`.
- `createdAt` — DateTime, default now.

Unique constraint on `(requestId, attendeeEmail)` to prevent duplicate registrations.

### New Services (registered on `ServiceRegistry`)

**`RegistrationService`** — Manages the `Registration` model and date voting logic. Methods:
- `createRegistration(requestId, data, token)` — Validates token and request status, creates registration, calls `checkThresholds`.
- `getEventInfo(requestId, token)` — Returns public event info (class details, proposed dates, location, current vote tallies). Validates token.
- `listRegistrations(requestId)` — Admin/instructor only. Returns all registrations with date vote tallies.
- `checkThresholds(requestId)` — Sums kids per proposed date. If any date meets `minHeadcount`, calls `finalizeDate()`.
- `finalizeDate(requestId, date)` — Sets `confirmedDate`, transitions status to `confirmed`, updates registrant statuses, triggers notifications and iCal delivery.
- `generateDigest(requestId)` — Produces a registration summary (names, kid counts per date, totals) for the email digest job.

### Modified Services

**`RequestService`** — Gains a status transition state machine:
- `VALID_TRANSITIONS` map: `{ new: ['discussing', 'cancelled'], discussing: ['dates_proposed', 'cancelled'], dates_proposed: ['confirmed', 'cancelled'], confirmed: ['completed', 'cancelled'] }`.
- `transitionStatus(requestId, newStatus, data?)` — Validates the transition, applies side effects, updates status. `data` is optional and carries context like `proposedDates` for `dates_proposed`.
- Side effects by transition:
  - → `dates_proposed`: generate `registrationToken`, store `proposedDates`.
  - → `confirmed`: handled by `RegistrationService.finalizeDate()` instead.
  - → `cancelled`: send cancellation emails to all participants.
  - → `completed`: no side effect (admin marks after the event runs).

**`InstructorService`** — Gains `advanceToNextInstructor(requestId, currentAssignmentId)`:
- Marks current assignment `timed_out`.
- Queries `MatchingService` for next candidate not already assigned.
- Creates new `InstructorAssignment` if candidate exists; otherwise notifies admin.

**`EmailService`** — New methods:
- `sendEventConfirmation(to, eventDetails, icsBuffer)` — Sends iCal invite as email attachment.
- `sendDateChangeNotification(to, eventDetails, confirmedDate)` — Notifies registrant that a different date was chosen.
- `sendCancellationNotification(to, eventDetails)` — Notifies a participant that the event was cancelled.
- `sendDeadlineExpiredNotification(to, eventDetails)` — Notifies requester/admin that the voting deadline passed without quorum.
- `sendRegistrationDigest(replyTo, threadAddress, digestHtml)` — Sends the registration summary to the event email thread.

### New API Routes

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/events/:requestId` | token (query) | Public event info page — class details, proposed dates, location, vote tallies |
| POST | `/api/events/:requestId/register` | token (query) | Register for a private event — name, email, kids, date votes |
| GET | `/api/events/:requestId/registrations` | admin/instructor | List all registrations with vote tallies |
| POST | `/api/admin/requests/:id/finalize-date` | admin | Manually finalize a date for the event |
| PUT | `/api/admin/requests/:id` | admin | Update event config: minHeadcount, votingDeadline, eventType |

### Modified API Routes

| Method | Path | Change |
|--------|------|--------|
| PUT | `/api/admin/requests/:id/status` | Now validates transitions via state machine; applies side effects |

### New Scheduled Jobs

Three new jobs registered with `SchedulerService` at app startup:

**`assignment-reminders`** (hourly):
- Finds pending `InstructorAssignment` records where `notifiedAt + REMINDER_INTERVAL_HOURS < now` and `reminderCount < MAX_REMINDERS`.
- Sends reminder email, increments `reminderCount`.
- Finds pending assignments where `timeoutAt < now`. Calls `InstructorService.advanceToNextInstructor()`.

**`registration-digest`** (daily):
- Finds `EventRequest` records in `dates_proposed` status.
- For each, calls `RegistrationService.generateDigest()` and sends via `EmailService.sendRegistrationDigest()`.

**`deadline-check`** (hourly):
- Finds `EventRequest` records in `dates_proposed` where `votingDeadline < now`.
- Runs threshold check. If no date meets `minHeadcount`, sends deadline-expired notification.

### New npm Dependencies

**`ical-generator`** — Lightweight iCal (.ics) file generation. No native dependencies. Used to produce VEVENT attachments for event confirmation emails.

## Why

The spec (§3.3, §3.5, §5.5, §5.6, §9 Phase 2) defines registration and event finalization as Phase 2 work. Sprint 1 delivered intake (unverified→new) and Sprint 2 delivered site coordination. The system cannot deliver end-to-end value without the status pipeline, date voting, headcount threshold, and event confirmation flows. The instructor reminder job was planned for Sprint 1 but only the email method was implemented — the scheduler integration was missing.

## Impact on Existing Components

- **`EventRequest` model** — Extended with 7 new fields. Existing queries continue to work; new fields are nullable with defaults.
- **`RequestService`** — Existing `createRequest()`, `verifyRequest()`, `expireUnverified()` are unchanged. New `transitionStatus()` method adds the state machine without modifying existing paths.
- **`InstructorAssignment` model** — Extended with `timeoutAt`. Existing assignment creation in `verifyRequest` should set `timeoutAt` at creation time.
- **`EmailService`** — Extended with 5 new methods. Existing methods unchanged.
- **`SchedulerService`** — Three new job registrations at startup. Existing `daily-backup` and `weekly-backup` jobs unaffected.
- **Admin routes** — `PUT /api/admin/requests/:id/status` gains validation logic. No breaking changes to existing callers (the route already accepts a status body).
- **Client** — New pages/components for public event info and registration. Existing admin pages extended with new controls.

## Migration Concerns

New columns on `EventRequest` and `InstructorAssignment` are all nullable or have defaults, so the migration is additive and backward-compatible. New `Registration` model is a new table. No data migration needed — there are no events currently in `dates_proposed` or later statuses.

SQLite schema generated via `server/prisma/sqlite-push.sh` as usual. Array fields (`proposedDates`, `availableDates`) use JSON strings in SQLite via transformer, same pattern as existing array fields.
