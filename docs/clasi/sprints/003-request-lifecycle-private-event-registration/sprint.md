---
id: "003"
title: "Request Lifecycle & Private Event Registration"
status: planning
branch: sprint/003-request-lifecycle-private-event-registration
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

# Sprint 003: Request Lifecycle & Private Event Registration

## Goals

Deliver the complete request status lifecycle from `new` through `confirmed` to `completed`/`cancelled`, the private event registration flow with date voting, headcount thresholds, date finalization, iCal invite delivery, registration digest emails, and the instructor assignment reminder/timeout job.

## Problem

Sprint 1 built request intake and matching (unverified→new). Sprint 2 added site registration, email thread addresses, and Asana task creation. But the system stops at `new` — there is no way to advance a request through the coordination pipeline (`discussing → dates_proposed → confirmed → completed/cancelled`), no way for families to register for confirmed events, no date voting mechanism, no headcount threshold enforcement, and no automated instructor reminder cadence. The core value proposition — a self-service pipeline from request to running event — is incomplete.

## Solution

1. **Request status machine** — Implement validated transitions through the full lifecycle: `new → discussing → dates_proposed → confirmed → completed / cancelled`. Admin can override status via `PUT /api/admin/requests/:id/status`. Certain transitions trigger side effects (notifications, date proposals, confirmations).

2. **Date proposal flow** — When admin moves a request to `dates_proposed`, the system records the proposed dates on the EventRequest. Attendees can then vote on which dates work.

3. **Private event registration** — New `Registration` model and public registration endpoint (`POST /api/events/:requestId/register`). Attendees provide name, email, number of kids, and select which proposed dates they can attend. A shareable registration link is generated for confirmed events.

4. **Headcount threshold & date finalization** — Each event has a configurable `minHeadcount` and `votingDeadline`. A scheduled job checks whether any proposed date has crossed the headcount threshold. When it does, that date is auto-selected (highest count wins if multiple clear), the request moves to `confirmed`, and all parties are notified.

5. **iCal invite delivery** — When a date is finalized, confirmed attendees (those who voted for the winning date) receive an iCal (.ics) email attachment. Attendees who voted for a different date receive a notification that a different date was chosen.

6. **Registration digest emails** — A scheduled job sends periodic summaries to the event email thread: registrant names, kid counts per date, and totals.

7. **Instructor assignment reminder job** — Wire `EmailService.sendMatchReminder()` into the scheduler. Configurable reminder cadence (`REMINDER_INTERVAL_HOURS`, default 24h). After `ASSIGNMENT_TIMEOUT_HOURS` (default 48h) with no response, auto-decline the assignment and advance to the next matched instructor.

8. **Admin event configuration** — Admin can set per-event `minHeadcount`, `votingDeadline`, and `eventType` (private/public). Admin can manually confirm or cancel events.

## Success Criteria

- An admin can move a request through all statuses: new → discussing → dates_proposed → confirmed → completed; or cancel at any point.
- When a request reaches `dates_proposed`, a shareable registration link is generated.
- Attendees can register via the link: provide name, email, kid count, and vote on dates.
- When a proposed date's total kid count meets `minHeadcount`, the date is auto-finalized, the request moves to `confirmed`, and iCal invites are delivered to matching registrants.
- Registrants who voted for a non-winning date receive a notification.
- Registration digest emails are periodically sent to the event email thread.
- Unresponsive instructors receive reminders on a configurable cadence; after timeout, the system advances to the next matched instructor.
- All server-side behaviour is covered by Vitest + Supertest tests using SQLite.

## Scope

### In Scope

**Request status machine:**
- Validated transitions: `new → discussing → dates_proposed → confirmed → completed / cancelled`. Cancellation allowed from any non-terminal status.
- `PUT /api/admin/requests/:id/status` gains real transition validation (currently exists but has no logic).
- Side effects on transition: `dates_proposed` generates a registration link token; `confirmed` triggers iCal delivery; `cancelled` sends cancellation notifications.
- `EventRequest` schema additions: `eventType` (private/public, default private), `minHeadcount` (Int, nullable), `votingDeadline` (DateTime, nullable), `confirmedDate` (DateTime, nullable), `registrationToken` (String, unique, nullable), `assignedInstructorId` (FK to InstructorProfile, nullable).

**Private event registration (spec §3.3, §5.6):**
- New `Registration` model: `id`, `requestId` FK, `attendeeName`, `attendeeEmail`, `numberOfKids`, `availableDates[]` (which proposed dates they can attend), `status` (interested/confirmed/declined), `createdAt`.
- `POST /api/events/:requestId/register` — public endpoint; validates registration token from query string; creates registration record.
- `GET /api/events/:requestId` — public event info page (class details, dates, location, remaining capacity). Accessible via shareable link with registration token.
- `GET /api/events/:requestId/registrations` — admin/instructor only; returns all registrations with date vote tallies.

**Date voting & finalization (spec §3.3 steps 4–9):**
- Attendees select all proposed dates they can attend when registering.
- `RegistrationService.checkThresholds()` — called after each new registration and by the scheduled job. For each proposed date, sum `numberOfKids` across registrations that include that date. If any date meets `minHeadcount`, auto-finalize.
- If multiple dates clear the threshold, the date with the highest kid count wins. Ties go to the earliest date.
- On finalization: set `EventRequest.confirmedDate`, transition to `confirmed`, notify all registrants and parties.

**iCal invite delivery (spec §3.3 steps 8–9):**
- `EmailService.sendEventConfirmation()` — sends an `.ics` attachment to registrants who voted for the confirmed date.
- `EmailService.sendDateChangeNotification()` — notifies registrants who voted for a different date that the event date differs from their preference.

**Headcount deadline enforcement:**
- If `votingDeadline` passes and no date meets `minHeadcount`, notify the requester and admin. The event can be cancelled or rescheduled by admin.

**Registration digest emails (spec §3.4 step 6):**
- Scheduled job `registration-digest`: sends a summary email to the event email thread with registrant names, kid counts per proposed date, and totals. Runs daily for events in `dates_proposed` status.

**Instructor assignment reminder job (spec §3.5 steps 4–5):**
- Scheduled job `assignment-reminders`: finds pending `InstructorAssignment` records past the reminder threshold. Sends `sendMatchReminder()`. After `ASSIGNMENT_TIMEOUT_HOURS` (env, default 48) with no response, sets assignment to `timed_out` and triggers `MatchingService` to advance to the next candidate.
- `InstructorAssignment` schema addition: `timeoutAt` (DateTime, nullable) — set when the assignment is created, based on `ASSIGNMENT_TIMEOUT_HOURS`.

**Admin event configuration:**
- `PUT /api/admin/requests/:id` — update `minHeadcount`, `votingDeadline`, `eventType`.
- Admin can manually finalize a date (override threshold): `POST /api/admin/requests/:id/finalize-date` with `{ date }`.

**Client UI updates:**
- Public event page: shows event details, proposed dates, registration form with date voting.
- Admin request detail: add status transition controls, event configuration fields (minHeadcount, votingDeadline, eventType), registration summary view, manual date finalization button.
- Admin requests list: status filter includes new statuses.

### Out of Scope

- Public event registration / Meetup integration — Sprint 4
- Pike13 write-back (booking confirmed instructor) — later Phase 2 sprint
- Inbound SES email processing / AI extraction — Sprint 5
- Google Calendar integration — Sprint 4
- Equipment reservation — Phase 3
- FEAT-1 Native Registration (Astro component, unified capacity) — Phase 2b
- Asana bidirectional sync via webhooks — Phase 3
- Site rep ability to view/manage requests — Sprint 4+
- Waitlist when registration is full — Sprint 4

## Test Strategy

All server tests use Vitest + Supertest with SQLite. File parallelism remains disabled.

- **`request-lifecycle.test.ts`** — status transition validation: valid transitions succeed, invalid transitions return 422. Side effects: registration token generated on `dates_proposed`, cancellation notification on `cancelled`.
- **`private-registration.test.ts`** — registration creation, date voting, duplicate email prevention, capacity tracking,  invalid token rejection.
- **`date-finalization.test.ts`** — threshold crossing triggers auto-finalization, multi-date tiebreaker (highest count wins, earliest date breaks ties), manual admin finalization, deadline expiry notification.
- **`ical-delivery.test.ts`** — iCal attachment generated with correct VEVENT fields, sent to matching registrants, date-change notification sent to non-matching registrants.
- **`registration-digest.test.ts`** — digest job generates correct summary, sends to email thread address, skips events not in `dates_proposed`.
- **`assignment-reminders.test.ts`** — reminder sent after threshold, timeout advances to next instructor, no reminder for already-responded assignments.
- **Client tests** — updated `AdminRequestsV2.test.tsx` for new status filters; new `EventRegistration.test.tsx` for the public registration form.

All outbound email captured by `InMemoryEmailTransport` in tests. Scheduler jobs tested by invoking handlers directly (not via timer intervals).

## Architecture Notes

- `RegistrationService` added to `ServiceRegistry`: manages registrations, date vote tallies, threshold checks, and digest generation.
- Status transitions are enforced by a state machine in `RequestService` — a simple `VALID_TRANSITIONS` map. Invalid transitions throw `ValidationError`.
- iCal generation uses the `ical-generator` npm package (lightweight, no native deps, works with SQLite).
- The registration token is a random UUID generated when a request enters `dates_proposed` status. The public event page and registration endpoint both require this token.
- Scheduled jobs (`assignment-reminders`, `registration-digest`, `deadline-check`) are registered with `SchedulerService` at app startup, same as existing jobs.

## GitHub Issues

(None yet.)

## Definition of Ready

Before tickets can be created, all of the following must be true:

- [x] Sprint planning documents are complete (sprint.md, use cases, architecture)
- [x] Architecture review passed
- [x] Stakeholder has approved the sprint plan

## Tickets

| # | Title | Depends On | Use Cases |
|---|-------|-----------|-----------|
| 001 | Prisma schema migration — Registration model, EventRequest & InstructorAssignment extensions | — | All (foundation) |
| 002 | Request status transition state machine | 001 | SUC-001, SUC-002 |
| 003 | EmailService extensions — iCal generation, cancellation, digest, and deadline notifications | 002 | SUC-002, SUC-006, SUC-007, SUC-009 |
| 004 | RegistrationService — registration, event info, threshold check, and date finalization | 002, 003 | SUC-003, SUC-004 |
| 005 | Public event routes — event info, registration, and registrations list | 004 | SUC-003 |
| 006 | Admin event configuration & manual date finalization routes | 004 | SUC-005 |
| 007 | Instructor assignment timeout & assignedInstructorId enhancements | 001 | SUC-008 |
| 008 | Scheduled jobs — assignment reminders, registration digest, deadline check | 003, 004, 007 | SUC-008, SUC-009 |
| 009 | Client — public event page & registration form | 005 | SUC-003, SUC-006, SUC-007 |
| 010 | Client — admin request detail & event management UI enhancements | 006 | SUC-001, SUC-005 |

(Created after stakeholder approval.)

## Definition of Ready

Before tickets can be created, all of the following must be true:

- [ ] Sprint planning documents are complete (sprint.md, use cases, architecture)
- [ ] Architecture review passed
- [ ] Stakeholder has approved the sprint plan

## Tickets

(To be created after sprint approval.)
