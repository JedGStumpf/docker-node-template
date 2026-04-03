---
sprint: "004"
status: draft
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Architecture Update — Sprint 004: Public Events, Calendar Integration & Email Queue

## What Changed

### Modified Prisma Models

**`EventRequest` additions:**
- `meetupEventId` — String, nullable. Meetup event ID returned on creation.
- `meetupEventUrl` — String, nullable. Meetup event URL for display.
- `meetupRsvpCount` — Int, default 0. Last-synced RSVP count from Meetup.
- `googleCalendarEventId` — String, nullable. Google Calendar event ID.
- `eventCapacity` — Int, nullable. Maximum kids for waitlist enforcement. When null, no cap.

### New Prisma Models

**`EmailQueue`** — Outbound email queue with retry support.
- `id` — String, UUID, default auto.
- `recipient` — String. Email address.
- `subject` — String.
- `textBody` — String.
- `htmlBody` — String, nullable.
- `replyTo` — String, nullable.
- `attachments` — String, nullable. JSON-encoded array of `{ filename, content (base64), contentType }`.
- `status` — String, default `"pending"`. Values: `pending`, `sent`, `failed`, `dead`.
- `attempts` — Int, default 0.
- `nextRetryAt` — DateTime, nullable. Null when pending (immediate), set after failure.
- `lastError` — String, nullable.
- `createdAt` — DateTime, default now.

Index on `(status, nextRetryAt)` for efficient queue polling.

### New Services

**`MeetupService`** — Meetup API integration. Follows the existing client injection pattern.
- Constructor accepts `IMeetupClient` (interface with `createEvent()`, `getRsvps()`, `updateEvent()`).
- `createMeetupEvent(request: EventRequest)` — Creates a Meetup event. Maps `classSlug` to a Meetup group using `groups.json` from `ContentService`. Builds description with class details, location, and external registration URL (if present, placed prominently at top per spec §3.4 step 2). Returns `{ meetupEventId, meetupEventUrl }`.
- `syncRsvps(requestId: string)` — Pulls current RSVP count for the request's Meetup event. Updates `meetupRsvpCount` on the `EventRequest`.
- `MockMeetupClient` — Returns fake IDs for tests. `RealMeetupClient` — Calls Meetup GraphQL API.

**`GoogleCalendarService`** — Google Calendar API integration.
- Constructor accepts `IGoogleCalendarClient` (interface with `createEvent()`, `deleteEvent()`).
- `createCalendarEvent(request: EventRequest)` — Creates a calendar event on the League's shared calendar. Event details: summary = class title, start/end from `confirmedDate`, location from request, description includes requester name, expected headcount, and assigned instructor name.
- `MockGoogleCalendarClient` — Returns fake event IDs. `RealGoogleCalendarClient` — Uses `googleapis` package with service account auth. Calendar ID from `GOOGLE_CALENDAR_ID` env var.
- Graceful degradation: if `GOOGLE_CALENDAR_ID` is not set, `createCalendarEvent()` logs a warning and returns null (no error thrown).

**`EmailQueueService`** — Manages the email queue lifecycle.
- `enqueue(message: EmailMessage)` — Inserts a row into `EmailQueue` with status `pending`. Called by `EmailService` instead of `transport.send()`.
- `processPending(transport: IEmailTransport, batchSize?: number)` — Called by the `email-sender` job. Queries pending rows where `nextRetryAt` is null or ≤ now, limited to `batchSize` (default 20). For each: calls `transport.send()`. On success: status → `sent`. On failure: increments `attempts`, computes backoff (`[60, 300, 900, 3600, 14400]` seconds), sets `nextRetryAt`. If `attempts ≥ 5`: status → `dead`.
- `listFailed(filters?)` — Returns queue rows with status `failed` or `dead`. For admin route.
- `retryDead(id: string)` — Resets a `dead` row to `pending` with `attempts: 0`, `nextRetryAt: null`.
- **Concurrency:** PostgreSQL: `FOR UPDATE SKIP LOCKED` on pending rows to prevent multiple workers processing the same email. SQLite: single-writer lock provides natural serialization (same pattern as `SchedulerService`).

### Modified Services

**`EmailService`** — Refactored to enqueue instead of send directly.
- The `send()` method on `IEmailTransport` is no longer called from business logic.
- Each public method (`sendVerificationEmail`, `sendMatchNotification`, etc.) now calls `emailQueueService.enqueue(message)` instead of `this.transport.send(message)`.
- **Constructor change:** Accepts `EmailQueueService` in addition to `IEmailTransport`. The transport is stored but only used by the queue worker (not by method callers).
- **Test compatibility:** `InMemoryEmailTransport.sent` still works in tests because the test `email-sender` job can be invoked manually to flush the queue. Alternatively, tests can inspect `EmailQueue` rows directly.

**`RequestService.transitionStatus()`** — Extended `confirmed` transition side effects:
- **Meetup:** If `eventType === 'public'`, call `meetupService.createMeetupEvent()`. Store result on request.
- **Google Calendar:** Call `googleCalendarService.createCalendarEvent()`. Store result on request.
- **Pike13 write-back:** If `assignedInstructorId` is set, look up instructor's `pike13UserId`, call `pike13Client.bookInstructor()`.
- All three are best-effort: failures are logged and don't roll back the confirmation.

**`RegistrationService`** — Extended for waitlist:
- `createRegistration()` — After confirming status, checks capacity: if event is `confirmed` and `eventCapacity` is set and confirmed kid count ≥ `eventCapacity`, creates registration with `status: waitlisted`.
- New: `cancelRegistration(registrationId: string)` — Sets registration to `cancelled`. If the event is `confirmed` and a waitlisted registration exists, promotes the oldest one to `confirmed` via `promoteFromWaitlist()`.
- New: `promoteFromWaitlist(requestId: string)` — Finds oldest `waitlisted` registration, changes to `confirmed`, sends iCal invite via `EmailService`.

**`IPike13Client`** — Extended with:
- `bookInstructor(pike13UserId: string, date: Date, classSlug: string): Promise<{ appointmentId: string } | null>` — Books the instructor in Pike13. `MockPike13Client` returns a fake ID. `RealPike13Client` calls Pike13 API.

**`ServiceRegistry`** — New properties:
- `meetup: MeetupService`
- `googleCalendar: GoogleCalendarService`
- `emailQueue: EmailQueueService`
- Construction follows existing patterns (mock clients in test, real in production).

### New API Routes

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/events/:requestId/registrations/:id/cancel` | token (body) | Cancel a registration (triggers waitlist promotion) |
| GET | `/api/admin/email-queue` | admin | List failed/dead email queue entries |
| POST | `/api/admin/email-queue/:id/retry` | admin | Retry a dead email |

### Modified API Routes

| Method | Path | Change |
|--------|------|--------|
| PUT | `/api/admin/requests/:id` | Add `eventCapacity` to updatable fields |
| POST | `/api/events/:requestId/register` | Support `waitlisted` status when at capacity (for confirmed events) |

### New Scheduled Jobs

| Job | Frequency | Purpose |
|-----|-----------|---------|
| `email-sender` | Every 5 minutes | Process pending email queue rows |
| `meetup-rsvp-sync` | Daily | Sync RSVP counts for confirmed public events |

### New npm Dependencies

- `googleapis` — Google Calendar API client. Used by `RealGoogleCalendarClient`.
- No dependency for Meetup — uses `fetch()` against Meetup's GraphQL API.

### Environment Variables (all optional — graceful degradation)

| Variable | Purpose |
|----------|---------|
| `GOOGLE_CALENDAR_ID` | Shared League calendar ID |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | JSON key for Google service account |
| `MEETUP_API_KEY` | Meetup API OAuth token |
| `MEETUP_GROUP_URLNAME` | Default Meetup group URL name (fallback if groups.json mapping fails) |

## Why

The spec (§3.4, §4.1, §9 Phase 2) defines public event Meetup integration, Google Calendar, and Pike13 write-back as Phase 2 deliverables. Sprint 3 completed the private event lifecycle but left public events unimplemented. The email queue addresses a known reliability gap from Sprint 3 (transient SES failures lose messages). The waitlist was explicitly deferred from Sprint 3 and is needed before FEAT-1 native registration adds unified capacity tracking.

## Impact on Existing Components

- **`EventRequest` model** — Extended with 5 new nullable fields. Existing queries continue to work.
- **`EmailService`** — Breaking change: methods now enqueue instead of sending. Tests need to either flush the queue or inspect queue rows. The `InMemoryEmailTransport` remains for the worker to use.
- **`RequestService.transitionStatus()`** — `confirmed` transition gains three new best-effort side effects. Existing behavior unchanged.
- **`RegistrationService`** — `createRegistration()` gains capacity check for waitlist. Existing behavior for under-capacity events unchanged.
- **`IPike13Client`** — Interface gains one new method. Both `MockPike13Client` and `RealPike13Client` must implement it.
- **`ServiceRegistry`** — Three new service properties. `clearAll()` must add `emailQueue.deleteMany()`.
- **`SchedulerService`** — Two new job registrations. Existing jobs unaffected.

## Migration Concerns

New columns on `EventRequest` are all nullable or have defaults — additive migration, backward-compatible. New `EmailQueue` model is a new table. No data backfill needed.

SQLite schema generated via `server/prisma/sqlite-push.sh`. New fields are all simple types (String, Int, DateTime) — no array field handling needed for the new columns.

## Open Questions

1. **Meetup group mapping:** The spec (§4.5) mentions `groups.json` maps class subgroups to Meetup groups. Is this file available from `ContentService`, or does it need a separate fetch? What's the fallback if a class has no mapping?

2. **Google Calendar event timing:** For private events, `confirmedDate` stores only a date (no time). Should the calendar event be all-day, or should we use a default time (e.g. 10am–12pm)?

3. **Email queue — test strategy:** Refactoring `EmailService` to enqueue affects every existing test that checks `InMemoryEmailTransport.sent`. Two options: (a) add a `flushQueue()` helper that processes the queue synchronously in tests, or (b) bypass the queue in test mode and send directly. Which approach?
