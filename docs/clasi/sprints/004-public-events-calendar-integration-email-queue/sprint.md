---
id: "004"
title: "Public Events, Calendar Integration & Email Queue"
status: planning
branch: sprint/004-public-events-calendar-integration-email-queue
use-cases:
- SUC-001
- SUC-002
- SUC-003
- SUC-004
- SUC-005
- SUC-006
- SUC-007
- SUC-008
- SUC-009
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Sprint 004: Public Events, Calendar Integration & Email Queue

## Goals

Complete the Phase 2 feature set: public event flow with Meetup integration, Google Calendar for confirmed events, Pike13 write-back for instructor bookings, registration waitlist, and a reliable outbound email queue with retry.

## Problem

Sprint 3 delivered the private event lifecycle (date voting, headcount threshold, iCal invites). But public events — the other half of the spec (§3.4) — have no implementation. Confirmed events don't appear on the League's internal Google Calendar (§3.3 step 10, §3.4 step 7). Confirmed instructors aren't booked in Pike13 (§3.5, §4.1). Once a private event fills its headcount, new registrants are rejected outright with no waitlist (FEAT-1 §3.1). And outbound emails have no retry — a transient SES failure loses the message permanently (Sprint 3 arch notes).

## Solution

1. **Meetup integration** — New `MeetupService` with API client. When a request is confirmed with `eventType: public`, create a Meetup event via the Meetup API (spec §3.4 steps 1–2). Include the external registration URL prominently in the description when provided. Periodically sync RSVPs from Meetup for tracking. Store `meetupEventId` on `EventRequest`.

2. **Google Calendar integration** — New `GoogleCalendarService`. When any event is confirmed, add it to the League's shared internal calendar via Google Calendar API using a service account. Store `googleCalendarEventId` on `EventRequest`. Degrades gracefully (501) if credentials are missing.

3. **Pike13 write-back** — Extend `Pike13Client` with a write method. When a request transitions to `confirmed` and has an `assignedInstructorId`, book the instructor in Pike13 for the confirmed date so it appears on their Pike13 calendar. Handle failures gracefully (log + notify admin).

4. **Waitlist** — When a private event's confirmed date has reached capacity (total kids ≥ minHeadcount or a new `eventCapacity` field), new registrations go to `waitlisted` status instead of being rejected. If a confirmed registrant cancels, promote the next waitlisted person and send them an updated iCal.

5. **Outbound email queue** — New `EmailQueue` model (Prisma). All outbound emails are enqueued as rows instead of sent inline. A scheduled job (`email-sender`) picks up pending rows and sends them with exponential backoff retry. Failed emails are visible to admins. Replaces the current fire-and-forget pattern.

## Success Criteria

- Admin confirms a public event → Meetup event is created with correct description (including external registration URL if present). Meetup event ID stored on the request.
- RSVP sync job pulls RSVPs from Meetup and stores counts on the request.
- Admin confirms any event → event appears on the League's internal Google Calendar.
- Admin confirms an event with an assigned instructor → instructor is booked in Pike13 for that date.
- After a private event is confirmed and at capacity, a new registration creates a `waitlisted` record. When a confirmed registrant cancels, the next waitlisted person is promoted to `confirmed` and receives an iCal invite.
- All outbound emails go through the queue table. Failed sends are retried with exponential backoff. Admins can view and manually retry failed emails.
- All new server-side behaviour is covered by Vitest + Supertest tests using SQLite.

## Scope

### In Scope

**Public event Meetup integration (spec §3.4, §4.1):**
- `MeetupService` with `IMeetupClient` interface (mock for tests, real for production).
- `createMeetupEvent(request)` — creates a Meetup event with class details, date, location, and optional external registration URL in description.
- `syncRsvps(requestId)` — pulls RSVP data from Meetup, stores count on request.
- Side effect on `confirmed` transition when `eventType === 'public'`: call `MeetupService.createMeetupEvent()`.
- Scheduled job `meetup-rsvp-sync` (daily): syncs RSVPs for confirmed public events until the event date.
- `EventRequest` schema: add `meetupEventId` (String, nullable), `meetupRsvpCount` (Int, default 0).

**Google Calendar integration (spec §3.3 step 10, §3.4 step 7):**
- `GoogleCalendarService` with service account auth.
- `createCalendarEvent(request)` — adds event to shared League calendar.
- Side effect on `confirmed` transition: call `GoogleCalendarService.createCalendarEvent()`.
- `EventRequest` schema: add `googleCalendarEventId` (String, nullable).
- Graceful degradation: returns 501 if `GOOGLE_CALENDAR_ID` or credentials missing.

**Pike13 write-back (spec §3.5, §4.1):**
- Extend `IPike13Client` with `bookInstructor(pike13UserId, date, classSlug)`.
- Side effect on `confirmed` transition when `assignedInstructorId` is set: book the instructor in Pike13.
- Failure logs error and notifies admin; does not block confirmation.

**Registration waitlist (FEAT-1 §3.1, Sprint 3 deferred):**
- New `eventCapacity` field on `EventRequest` (Int, nullable). When null, no cap is enforced.
- New registration status: `waitlisted`.
- When a registration comes in for a confirmed event at capacity, status is `waitlisted` instead of 422.
- `cancelRegistration(registrationId)` — sets status to `cancelled`, promotes next waitlisted person.
- Promotion sends iCal invite to the promoted registrant.
- Admin route to view waitlist and manually promote/remove.

**Outbound email queue (Sprint 3 arch notes, TODO):**
- New `EmailQueue` Prisma model: `id`, `recipient`, `subject`, `textBody`, `htmlBody`, `replyTo`, `attachments` (JSON), `status` (pending/sent/failed/dead), `attempts`, `nextRetryAt`, `lastError`, `createdAt`.
- `EmailService` refactored: all `send()` calls enqueue a row instead of sending directly. Public API unchanged.
- Scheduled job `email-sender` (every 5 minutes): picks up pending/retryable rows using `FOR UPDATE SKIP LOCKED` (Postgres) or simple query (SQLite), sends via SES transport, updates status.
- Exponential backoff: 1min, 5min, 15min, 1hr, 4hr. After 5 failures → `dead`.
- Admin route `GET /api/admin/email-queue` to list failed/dead emails.
- Admin route `POST /api/admin/email-queue/:id/retry` to manually retry a dead email.

### Out of Scope

- FEAT-1 Native Registration (Astro component, unified capacity tracking, attendance reconciliation) — separate sprint
- AI email thread extraction / inbound SES processing — Phase 3
- Asana bidirectional sync via webhooks — Phase 3
- Equipment reservation — Phase 3
- Meetup RSVP limit adjustment (requires FEAT-1 unified capacity) — deferred
- Registration digest for public events with combined Meetup+native counts — requires FEAT-1

## Test Strategy

All server tests use Vitest + Supertest with SQLite. File parallelism disabled.

- **`meetup-integration.test.ts`** — Meetup event creation on public event confirmation, external registration URL in description, RSVP sync stores count.
- **`google-calendar.test.ts`** — Calendar event created on confirmation, graceful degradation when credentials missing (501).
- **`pike13-writeback.test.ts`** — Instructor booked on confirmation, failure doesn't block confirmation.
- **`waitlist.test.ts`** — Registration at capacity creates waitlisted record, cancellation promotes next, promotion sends iCal.
- **`email-queue.test.ts`** — Emails enqueued not sent inline, sender job processes queue, retry with backoff, dead after max attempts, admin retry.
- **Client tests** — Updated admin UI tests for new fields (meetup event link, calendar event, waitlist view).

Mock clients for Meetup API, Google Calendar API, and Pike13 write via interface injection (same pattern as existing `MockPike13Client`).

## Architecture Notes

- `MeetupService`, `GoogleCalendarService` added to `ServiceRegistry` with mock/real client injection following the existing `Pike13Client` pattern.
- Email queue replaces inline send — the `IEmailTransport.send()` method is called by the queue worker, not by business logic. `EmailService.enqueue()` writes to DB; the scheduled job calls `transport.send()`.
- Waitlist logic lives in `RegistrationService` — extends the existing `createRegistration()` and adds `cancelRegistration()`.
- Pike13 write-back extends the existing `IPike13Client` interface with one new method.
- All new integrations degrade gracefully when credentials are missing (architecture rule: integrations return 501 with setup instructions).

## GitHub Issues

(None yet.)

## Tickets

(To be created after architecture review and stakeholder approval.)

## Definition of Ready

Before tickets can be created, all of the following must be true:

- [ ] Sprint planning documents are complete (sprint.md, use cases, architecture)
- [ ] Architecture review passed
- [ ] Stakeholder has approved the sprint plan

## Tickets

(To be created after sprint approval.)
