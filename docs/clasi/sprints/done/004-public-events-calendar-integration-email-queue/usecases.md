---
sprint: "004"
status: draft
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Sprint 004 Use Cases

## SUC-001: Public Event Creates Meetup Event on Confirmation

- **Actor**: System (triggered by admin confirming a public event)
- **Preconditions**: An `EventRequest` with `eventType: public` is in `dates_proposed` or being manually confirmed by admin. A confirmed date exists or is being set.
- **Main Flow**:
  1. Admin transitions a public request to `confirmed` (via auto-finalization or manual finalize-date).
  2. System detects `eventType === 'public'` in the `confirmed` transition side effects.
  3. System calls `MeetupService.createMeetupEvent()` with class details, date, location, and optional `externalRegistrationUrl`.
  4. Meetup API returns the event ID and URL.
  5. System stores `meetupEventId` and `meetupEventUrl` on the `EventRequest`.
- **Postconditions**: Meetup event exists; ID/URL stored on request.
- **Acceptance Criteria**:
  - [ ] `confirmed` transition for a public event calls Meetup API to create event
  - [ ] External registration URL is included prominently in Meetup event description when present
  - [ ] `meetupEventId` is stored on the `EventRequest`
  - [ ] If Meetup API fails, confirmation still succeeds; error is logged and admin notified
  - [ ] Private events do not trigger Meetup event creation

---

## SUC-002: Meetup RSVP Sync

- **Actor**: System (scheduled job)
- **Preconditions**: A `confirmed` public `EventRequest` has a `meetupEventId`. Event date is in the future.
- **Main Flow**:
  1. `meetup-rsvp-sync` scheduled job runs daily.
  2. For each confirmed public request with a `meetupEventId` where `confirmedDate > now`, system calls `MeetupService.syncRsvps(requestId)`.
  3. Service pulls RSVP count from Meetup API.
  4. System updates `meetupRsvpCount` on the request.
- **Postconditions**: `meetupRsvpCount` reflects current Meetup RSVPs.
- **Acceptance Criteria**:
  - [ ] Daily job syncs RSVPs for confirmed public events with future dates
  - [ ] Past events are skipped
  - [ ] API failure for one event doesn't prevent syncing others
  - [ ] Count stored on `EventRequest.meetupRsvpCount`

---

## SUC-003: Confirmed Event Added to Google Calendar

- **Actor**: System (triggered by confirmation transition)
- **Preconditions**: An `EventRequest` transitions to `confirmed`. Google Calendar credentials are configured.
- **Main Flow**:
  1. During the `confirmed` transition side effects, system calls `GoogleCalendarService.createCalendarEvent()`.
  2. Service uses a Google service account to add an event to the League's shared calendar with: title (class name), date/time, location, description (requester, headcount, instructor).
  3. Google Calendar returns the event ID.
  4. System stores `googleCalendarEventId` on the `EventRequest`.
- **Postconditions**: Event appears on League's internal Google Calendar.
- **Acceptance Criteria**:
  - [ ] `confirmed` transition creates a Google Calendar event
  - [ ] Calendar event includes class name, date, location, and description
  - [ ] `googleCalendarEventId` stored on the `EventRequest`
  - [ ] If credentials are missing, system logs a warning and skips (graceful degradation, no error thrown)
  - [ ] If Google API fails, confirmation still succeeds; error is logged

---

## SUC-004: Pike13 Write-Back Books Instructor

- **Actor**: System (triggered by confirmation transition)
- **Preconditions**: An `EventRequest` transitions to `confirmed`. The request has `assignedInstructorId` set and the instructor has a `pike13UserId`.
- **Main Flow**:
  1. During the `confirmed` transition side effects, system checks `assignedInstructorId`.
  2. System looks up the instructor's `pike13UserId`.
  3. System calls `pike13Client.bookInstructor(pike13UserId, confirmedDate, classSlug)`.
  4. Pike13 API confirms the booking.
- **Postconditions**: Instructor's Pike13 calendar shows the event.
- **Acceptance Criteria**:
  - [ ] `confirmed` transition with an assigned instructor triggers Pike13 booking
  - [ ] If Pike13 API fails, confirmation still succeeds; error is logged and admin notified
  - [ ] If no instructor is assigned, Pike13 booking is skipped
  - [ ] Booking is idempotent (re-confirming doesn't create duplicate)

---

## SUC-005: Registration Creates Waitlisted Record at Capacity

- **Actor**: Attendee
- **Preconditions**: A `confirmed` private event has `eventCapacity` set. Total confirmed kids ≥ `eventCapacity`.
- **Main Flow**:
  1. Attendee submits registration via `POST /api/events/:requestId/register`.
  2. System validates the token and checks capacity.
  3. Confirmed kids count ≥ `eventCapacity`.
  4. System creates a `Registration` with `status: waitlisted` instead of rejecting.
  5. Attendee sees: "The event is full. You've been added to the waitlist."
- **Postconditions**: Registration exists with `waitlisted` status.
- **Acceptance Criteria**:
  - [ ] Registration at capacity creates a `waitlisted` record (not 422)
  - [ ] Waitlisted registrations don't count toward capacity for further checks
  - [ ] When `eventCapacity` is null, no cap is enforced (unlimited)
  - [ ] Response indicates waitlisted status

---

## SUC-006: Waitlist Promotion on Cancellation

- **Actor**: Attendee (cancelling), System (promoting next)
- **Preconditions**: A confirmed event has waitlisted registrations. A confirmed registrant cancels.
- **Main Flow**:
  1. Confirmed registrant calls `POST /api/events/:requestId/registrations/:id/cancel` (or admin cancels on their behalf).
  2. System sets the registration to `cancelled`.
  3. System finds the oldest `waitlisted` registration (by `createdAt`).
  4. System promotes it to `confirmed` and sends an iCal invite.
  5. System sends notification to the promoted attendee.
- **Postconditions**: One waitlisted registration promoted to confirmed with iCal; cancelled registration marked.
- **Acceptance Criteria**:
  - [ ] Cancellation of a confirmed registration triggers promotion of the oldest waitlisted
  - [ ] Promoted registrant receives iCal invite email
  - [ ] If no waitlisted registrations exist, no promotion occurs
  - [ ] Admin can also trigger cancellation via admin route

---

## SUC-007: Emails Enqueued and Sent via Queue

- **Actor**: System
- **Preconditions**: Any email-triggering event occurs (verification, notification, iCal, etc.).
- **Main Flow**:
  1. `EmailService` method is called (e.g. `sendVerificationEmail()`).
  2. Instead of calling `transport.send()` directly, the method writes a row to `EmailQueue` with status `pending`.
  3. The `email-sender` scheduled job picks up pending rows.
  4. Job calls `transport.send()` for each row.
  5. On success: row status → `sent`.
  6. On failure: increment `attempts`, set `nextRetryAt` with exponential backoff, store `lastError`.
- **Postconditions**: Email delivered or queued for retry.
- **Acceptance Criteria**:
  - [ ] All outbound emails go through `EmailQueue` table, not sent inline
  - [ ] Successful sends update status to `sent`
  - [ ] Failed sends increment attempts and set next retry with backoff
  - [ ] After 5 failures, status is set to `dead`
  - [ ] Database transaction that triggers email is not affected by email send failure

---

## SUC-008: Admin Views and Retries Failed Emails

- **Actor**: Admin
- **Preconditions**: Authenticated admin session. One or more `EmailQueue` records have status `failed` or `dead`.
- **Main Flow**:
  1. Admin calls `GET /api/admin/email-queue?status=failed` to list failed emails.
  2. System returns email records with recipient, subject, attempts, last error.
  3. Admin calls `POST /api/admin/email-queue/:id/retry` to retry a dead email.
  4. System resets attempts to 0, status to `pending`, and clears `nextRetryAt`.
  5. Next `email-sender` job tick picks it up.
- **Postconditions**: Dead email reset to pending for retry.
- **Acceptance Criteria**:
  - [ ] `GET /api/admin/email-queue` returns filtered email queue records
  - [ ] `POST /api/admin/email-queue/:id/retry` resets a dead email to pending
  - [ ] Only admins can access these routes
  - [ ] Retried email is picked up by the next sender job tick

---

## SUC-009: Admin Configures Event Capacity

- **Actor**: Admin
- **Preconditions**: Authenticated admin session. An `EventRequest` exists.
- **Main Flow**:
  1. Admin calls `PUT /api/admin/requests/:id` with `{ eventCapacity: 25 }`.
  2. System updates the `eventCapacity` field on the request.
- **Postconditions**: `eventCapacity` is set; subsequent registrations respect the cap.
- **Acceptance Criteria**:
  - [ ] Admin can set `eventCapacity` on any request
  - [ ] Setting `eventCapacity` to null removes the cap
  - [ ] Existing waitlisted registrations are not auto-promoted when capacity increases (admin must manage manually)
