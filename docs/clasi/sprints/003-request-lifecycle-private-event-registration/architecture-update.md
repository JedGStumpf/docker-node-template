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
- `minHeadcount` — Int, nullable. Minimum kids required to run the event. Defaults to `10` in code when admin transitions to `dates_proposed` without providing a value (configurable via `DEFAULT_MIN_HEADCOUNT` env var).
- `votingDeadline` — DateTime, nullable. Defaults to `now + 7 days` in code when admin transitions to `dates_proposed` without providing a value (configurable via `DEFAULT_VOTING_DEADLINE_DAYS` env var).
- `confirmedDate` — DateTime, nullable. Set when a date is finalized (either automatically by threshold or manually by admin).
- `registrationToken` — String, unique, nullable. Generated on transition to `dates_proposed` using `crypto.randomBytes(32).toString('hex')` (64-char hex string, 256 bits of entropy). Used for public registration link.
- `proposedDates` — DateTime array, nullable. Set when admin moves request to `dates_proposed`.
- `assignedInstructorId` — FK to `InstructorProfile`, nullable. Set when an instructor accepts an assignment (in `InstructorService.handleAssignmentResponse()` when response is `'accept'`). This is a denormalization of the `InstructorAssignment` relationship for quick lookup — the assignment join table remains the source of truth for the full assignment history.

**`InstructorAssignment` additions:**
- `timeoutAt` — DateTime, nullable. Set on creation to `now + INSTRUCTOR_TIMEOUT_HOURS`. Existing `verifyRequest()` in `RequestService` and `advanceToNextInstructor()` in `InstructorService` must be updated to set this field when creating assignments.

**Backfill:** Existing pending assignments without `timeoutAt` should be backfilled via a Prisma migration data step: `UPDATE "InstructorAssignment" SET "timeoutAt" = "createdAt" + interval '24 hours' WHERE "timeoutAt" IS NULL AND status = 'pending'`. For SQLite: `UPDATE InstructorAssignment SET timeoutAt = datetime(createdAt, '+24 hours') WHERE timeoutAt IS NULL AND status = 'pending'`.

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

### State Transition Machine

The `EventRequest.status` field follows a strict state machine. All transitions go through `RequestService.transitionStatus()` — no direct Prisma updates to `status` are allowed outside this method.

**Valid Transitions:**

```
┌──────────┐    ┌────────────┐    ┌────────────────┐    ┌───────────┐    ┌───────────┐
│unverified│───▶│    new      │───▶│  discussing     │───▶│dates_     │───▶│ confirmed │───▶│ completed │
└──────────┘    └────────────┘    └────────────────┘    │proposed   │    └───────────┘    └───────────┘
  (existing)       │                    │                └───────────┘        │
                   │                    │                    │                │
                   ▼                    ▼                    ▼                ▼
               ┌──────────┐        ┌──────────┐        ┌──────────┐    ┌──────────┐
               │cancelled │        │cancelled │        │cancelled │    │cancelled │
               └──────────┘        └──────────┘        └──────────┘    └──────────┘
```

**Transition table with side effects:**

| From | To | Side Effects | Data Required |
|------|----|-------------|---------------|
| `unverified` | `new` | *(existing — handled by `verifyRequest()`)* | — |
| `new` | `discussing` | None | — |
| `new` | `cancelled` | Send cancellation emails | — |
| `discussing` | `dates_proposed` | Generate `registrationToken`, store `proposedDates`, set defaults for `minHeadcount`/`votingDeadline` if not provided | `{ proposedDates: DateTime[], minHeadcount?: number, votingDeadline?: DateTime }` |
| `discussing` | `cancelled` | Send cancellation emails | — |
| `dates_proposed` | `confirmed` | Set `confirmedDate`, update registrant statuses, send iCal + notifications | `{ confirmedDate: DateTime }` (from `finalizeDate()`) |
| `dates_proposed` | `cancelled` | Send cancellation emails to all registrants + participants | — |
| `confirmed` | `completed` | None (admin marks post-event) | — |
| `confirmed` | `cancelled` | Send cancellation emails to confirmed registrants + participants | — |

**Terminal states:** `completed`, `cancelled`. No transitions out of these.

**Idempotency rules:**
- If `transitionStatus()` is called with a transition that has already occurred (current status == newStatus), return the current record without error.
- If called with an invalid transition, throw `ValidationError`.
- For `dates_proposed`: reuse existing `registrationToken` if already generated; replace `proposedDates` with the new value.

### New Services (registered on `ServiceRegistry`)

**`RegistrationService`** — Manages the `Registration` model and date voting/threshold logic. Methods:

- `createRegistration(requestId, data)` — Validates token from request body, verifies request is in `dates_proposed` status, creates registration. Then calls `checkAndFinalizeThreshold()` inside a Prisma transaction.
- `getEventInfo(requestId, token)` — Returns public event info (class details, proposed dates, location, current vote tallies per date). Validates token. Response shape is small (max ~20 proposed dates); no pagination needed.
- `listRegistrations(requestId)` — Admin/instructor only. Returns all registrations with aggregated vote tallies per date.
- `checkAndFinalizeThreshold(requestId)` — Called within a `prisma.$transaction()`. Locks the `EventRequest` row (Postgres: `FOR UPDATE`; SQLite: relies on single-writer). Sums `numberOfKids` per proposed date across registrations. If any date meets `minHeadcount`, calls `finalizeDate()` for the winning date. **Tie-breaking:** highest kid count wins; if still tied, earliest date wins.
- `finalizeDate(requestId, date)` — Must be called within a transaction. Sets `confirmedDate` on the request, calls `RequestService.transitionStatus(requestId, 'confirmed', { confirmedDate: date })`. Updates registrant statuses: `confirmed` for those who voted for the winning date, `declined` for others. Queues email delivery (see Email Delivery Strategy below).
- `generateDigest(requestId)` — Produces a registration summary for the email digest job.

**ServiceRegistry addition:** Add `registration` property to `ServiceRegistry`, instantiate as `new RegistrationService(this.prisma)`.

### Modified Services

**`RequestService`** — Gains a status transition state machine:
- `VALID_TRANSITIONS` — Static map as shown in the transition table above.
- `transitionStatus(requestId, newStatus, data?)` — Implementation:
  1. Fetch current request inside a `prisma.$transaction()`.
  2. Validate that `currentStatus → newStatus` is in `VALID_TRANSITIONS`.
  3. Apply side effects per the transition table.
  4. Update status and any new fields.
  5. Return the updated request.

The existing `PUT /api/admin/requests/:id/status` route (currently at lines 130–149 in `routes/admin/requests.ts`) must be modified to call `RequestService.transitionStatus()` instead of doing a direct `prisma.eventRequest.update()`. The `allowedStatuses` set and direct update logic are replaced entirely by the state machine.

**`InstructorService`** — Already has `advanceToNextInstructor()` and `sendReminders()` (implemented in Sprint 1). Modifications:
- Set `timeoutAt` when creating new assignments in `advanceToNextInstructor()` (line ~201): add `timeoutAt: new Date(Date.now() + timeoutHours * 3600_000)` to the `create` data.
- Set `assignedInstructorId` on `EventRequest` when an assignment is accepted in `handleAssignmentResponse()`.

**`RequestService.verifyRequest()`** — Modify to set `timeoutAt` on the `InstructorAssignment` creation (the call happens via `matchingService` in the existing flow).

**`EmailService`** — New methods:
- `sendEventConfirmation(to, eventDetails, icsBuffer)` — Sends iCal invite as email attachment.
- `sendDateChangeNotification(to, eventDetails, confirmedDate)` — Notifies registrant that a different date was chosen (they voted for a date that wasn't selected).
- `sendCancellationNotification(to, eventDetails)` — Notifies a participant that the event was cancelled.
- `sendDeadlineExpiredNotification(to, eventDetails)` — Notifies requester/admin that the voting deadline passed without quorum.
- `sendRegistrationDigest(replyTo, threadAddress, digestHtml)` — Sends the registration summary to the event email thread.

### Concurrency & Transaction Strategy

**Critical invariant:** Only one `finalizeDate()` can succeed per request. Concurrent registrations or simultaneous manual/automatic finalization must not produce duplicate confirmations.

**Approach:**
- All threshold checks and finalization happen inside `prisma.$transaction()`.
- PostgreSQL: Use `SELECT ... FOR UPDATE` on the `EventRequest` row before reading status and checking thresholds. This serializes concurrent threshold checks for the same request.
- SQLite: Relies on SQLite's single-writer lock, which provides the same serialization naturally.
- `finalizeDate()` checks `request.status === 'dates_proposed'` as a guard. If the status is already `confirmed`, it returns early (idempotent).
- Race between scheduler `deadline-check` job and admin manual `finalize-date`: both go through the same `finalizeDate()` + transaction path, so only the first succeeds.

### Email Delivery Strategy

Emails triggered by `finalizeDate()` and `transitionStatus()` are sent **after** the database transaction commits, not inside it. This prevents transaction rollback from email failures and vice versa.

**Pattern:**
1. Database transaction: update request status, registrant statuses, etc. Collect a list of pending email operations (recipients, templates, data).
2. After commit: iterate pending emails, send each. Log failures to `console.error`.
3. **Partial failure tolerance:** If email delivery fails for some recipients, the database state is already correct. Failed emails are logged. Admin can view registrant status in the admin UI to identify who may need manual follow-up.
4. **No automatic retry in Sprint 3.** Retry/dead-letter is deferred to a future sprint where we add a proper outbound email queue table. For now, log-and-alert is sufficient.

### Registration Token Security

- **Entropy:** 256 bits via `crypto.randomBytes(32).toString('hex')` — computationally infeasible to brute-force.
- **Transport:** Tokens are accepted in the **request body** (`{ token: "..." }`) on `POST /api/events/:requestId/register` and as a **query parameter** on `GET /api/events/:requestId` (for initial page load from shared link). The GET query param is acceptable for link sharing but registration mutations use the body.
- **Rate limiting:** The public registration endpoint (`POST /api/events/:requestId/register`) is rate-limited to 10 requests per IP per 5 minutes via existing Express rate-limiter middleware.
- **Scope:** Each token is scoped to a single `EventRequest`. Tokens are single-use-purpose (cannot be used for anything else) and do not expire (the request's `votingDeadline` serves as the effective expiry).

### New API Routes

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/events/:requestId` | token (query) | Public event info page — class details, proposed dates, location, vote tallies |
| POST | `/api/events/:requestId/register` | token (body) | Register for a private event — name, email, kids, date votes |
| GET | `/api/events/:requestId/registrations` | admin/instructor | List all registrations with vote tallies |
| POST | `/api/admin/requests/:id/finalize-date` | admin | Manually finalize a date (calls `RegistrationService.finalizeDate()` with same transaction/guard logic) |
| PUT | `/api/admin/requests/:id` | admin | Update event config: minHeadcount, votingDeadline, eventType, proposedDates |

### Modified API Routes

| Method | Path | Change |
|--------|------|--------|
| PUT | `/api/admin/requests/:id/status` | Replace direct Prisma update with `RequestService.transitionStatus()`. Remove `allowedStatuses` set. Route becomes a thin adapter that validates the body has `{ status }` and optionally `{ data }`, then delegates to the service. |

### New Scheduled Jobs

Two new jobs registered with `SchedulerService` at app startup. (The existing `InstructorService.sendReminders()` already handles reminders and timeouts — it just needs `timeoutAt` field support added.)

**`registration-digest`** (daily):
- Finds `EventRequest` records in `dates_proposed` status.
- For each, calls `RegistrationService.generateDigest()` and sends via `EmailService.sendRegistrationDigest()`.

**`deadline-check`** (hourly):
- Finds `EventRequest` records in `dates_proposed` where `votingDeadline < now`.
- Runs `RegistrationService.checkAndFinalizeThreshold()`. If no date meets `minHeadcount`, sends deadline-expired notification via `EmailService.sendDeadlineExpiredNotification()` and transitions request to `cancelled` (or a new `expired` status — TBD with stakeholder).

### New npm Dependencies

**`ical-generator`** — Lightweight iCal (.ics) file generation. No native dependencies. Used to produce VEVENT attachments for event confirmation emails.

## Why

The spec (§3.3, §3.5, §5.5, §5.6, §9 Phase 2) defines registration and event finalization as Phase 2 work. Sprint 1 delivered intake (unverified→new) and Sprint 2 delivered site coordination. The system cannot deliver end-to-end value without the status pipeline, date voting, headcount threshold, and event confirmation flows. The instructor reminder/timeout logic was implemented in Sprint 1 (`InstructorService.sendReminders()` and `advanceToNextInstructor()`), but the `timeoutAt` field was not added to the schema — this sprint adds it for explicit deadline tracking.

## Impact on Existing Components

- **`EventRequest` model** — Extended with 7 new fields. Existing queries continue to work; new fields are nullable with defaults.
- **`RequestService`** — Existing `createRequest()`, `verifyRequest()`, `expireUnverified()` are unchanged. New `transitionStatus()` method adds the state machine without modifying existing paths. `verifyRequest()` is modified only to set `timeoutAt` on assignment creation.
- **`InstructorAssignment` model** — Extended with `timeoutAt`. Existing pending assignments without `timeoutAt` receive a backfill migration.
- **`InstructorService`** — `advanceToNextInstructor()` modified to set `timeoutAt` on new assignments. `handleAssignmentResponse()` modified to set `assignedInstructorId` on the `EventRequest` upon acceptance.
- **`EmailService`** — Extended with 5 new methods. Existing methods unchanged.
- **`SchedulerService`** — Two new job registrations at startup. Existing `daily-backup` and `weekly-backup` jobs unaffected.
- **Admin routes** — `PUT /api/admin/requests/:id/status` refactored to delegate to `RequestService.transitionStatus()`. Callers sending `{ status: "discussing" }` continue to work; the state machine validates the transition is legal from the current status.
- **Client** — New pages/components for public event info and registration. Existing admin pages extended with new controls.

## Migration Concerns

New columns on `EventRequest` and `InstructorAssignment` are all nullable or have defaults, so the migration is additive and backward-compatible. New `Registration` model is a new table. Backfill query for `timeoutAt` on existing pending assignments is included in the migration.

SQLite schema generated via `server/prisma/sqlite-push.sh` as usual. Array fields (`proposedDates`, `availableDates`) use JSON strings in SQLite via transformer, same pattern as existing array fields.
