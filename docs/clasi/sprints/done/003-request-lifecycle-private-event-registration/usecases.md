---
sprint: "003"
status: draft
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Sprint 003 Use Cases

## SUC-001: Admin Advances Request Through Status Lifecycle

- **Actor**: Admin
- **Preconditions**: Authenticated admin session. An `EventRequest` exists in `new` status.
- **Main Flow**:
  1. Admin calls `PUT /api/admin/requests/:id/status` with `{ status: "discussing" }`.
  2. System validates the transition (`new → discussing` is allowed).
  3. System updates `EventRequest.status` to `discussing`.
  4. Admin later advances to `dates_proposed` with `{ status: "dates_proposed", proposedDates: [...] }`.
  5. System validates the transition, stores proposed dates on the request, generates a unique `registrationToken`, and sets `EventRequest.status` to `dates_proposed`.
  6. Admin receives 200 with the updated request including the registration link.
- **Postconditions**: Request is in `dates_proposed` status; `registrationToken` is set; proposed dates are stored.
- **Acceptance Criteria**:
  - [ ] Valid transitions succeed and return 200 with updated request
  - [ ] Invalid transitions (e.g. `new → confirmed`) return 422 with error message
  - [ ] `registrationToken` is generated on transition to `dates_proposed`
  - [ ] Proposed dates are stored on the EventRequest when entering `dates_proposed`

---

## SUC-002: Admin Cancels a Request

- **Actor**: Admin
- **Preconditions**: Authenticated admin session. An `EventRequest` exists in any non-terminal status.
- **Main Flow**:
  1. Admin calls `PUT /api/admin/requests/:id/status` with `{ status: "cancelled" }`.
  2. System validates the transition (cancellation allowed from any non-terminal status).
  3. System updates status to `cancelled`.
  4. System sends cancellation notification to requester, assigned instructor (if any), and site rep (if registered site).
- **Postconditions**: Request is `cancelled`; cancellation emails dispatched.
- **Acceptance Criteria**:
  - [ ] Cancellation from `new`, `discussing`, `dates_proposed`, `confirmed` all succeed
  - [ ] Cancellation from `completed` or `cancelled` returns 422
  - [ ] Cancellation notification email is dispatched (verified via mock)

---

## SUC-003: Attendee Registers for a Private Event via Shareable Link

- **Actor**: Attendee (parent/family member)
- **Preconditions**: An `EventRequest` is in `dates_proposed` status with a valid `registrationToken`. Multiple proposed dates exist.
- **Main Flow**:
  1. Attendee opens the shareable registration link containing the registration token.
  2. Client calls `GET /api/events/:requestId?token=...` to load event details (class info, proposed dates, location, current registration tallies).
  3. Attendee fills in the registration form: name, email, number of kids, and selects all proposed dates that work for them.
  4. Client calls `POST /api/events/:requestId/register?token=...` with registration data.
  5. System validates the token, creates a `Registration` record with `status: interested` and the selected `availableDates`.
  6. System calls `RegistrationService.checkThresholds()` to see if any date now clears the `minHeadcount`.
  7. Attendee sees a confirmation: "You're registered! We'll let you know when the date is finalized."
- **Postconditions**: `Registration` record exists; threshold check has run.
- **Acceptance Criteria**:
  - [ ] `POST /api/events/:requestId/register` with valid token creates a registration and returns 201
  - [ ] Invalid or missing token returns 401
  - [ ] Registration for a request not in `dates_proposed` returns 422
  - [ ] Duplicate email for same request returns 409
  - [ ] `availableDates` must be a non-empty subset of the request's proposed dates

---

## SUC-004: Date Auto-Finalized When Headcount Threshold Met

- **Actor**: System (triggered by registration or scheduled job)
- **Preconditions**: An `EventRequest` in `dates_proposed` status has `minHeadcount` set. A proposed date's total kid registrations now meet or exceed `minHeadcount`.
- **Main Flow**:
  1. After a new registration (or on the scheduled `deadline-check` job tick), `RegistrationService.checkThresholds()` is called.
  2. System sums `numberOfKids` per proposed date across all registrations that include that date.
  3. One or more dates meet `minHeadcount`.
  4. System selects the date with the highest total. If tied, the earliest date wins.
  5. System sets `EventRequest.confirmedDate` to the winning date and transitions status to `confirmed`.
  6. System updates registration statuses: registrants who voted for the confirmed date → `confirmed`; others → `declined`.
  7. System sends iCal invite email to `confirmed` registrants (SUC-006).
  8. System sends date-change notification to `declined` registrants (SUC-007).
  9. System notifies admin, requester, instructor, and site rep of confirmation.
- **Postconditions**: Request is `confirmed`; `confirmedDate` set; registrant statuses updated; notifications sent.
- **Acceptance Criteria**:
  - [ ] When a date crosses `minHeadcount`, auto-finalization triggers
  - [ ] Highest kid count wins when multiple dates clear threshold
  - [ ] Earliest date breaks ties
  - [ ] `EventRequest.status` transitions to `confirmed` and `confirmedDate` is set
  - [ ] Registrants who voted for the winning date have `status: confirmed`
  - [ ] Registrants who did not vote for the winning date have `status: declined`

---

## SUC-005: Admin Manually Finalizes a Date

- **Actor**: Admin
- **Preconditions**: Authenticated admin session. An `EventRequest` is in `dates_proposed` status.
- **Main Flow**:
  1. Admin calls `POST /api/admin/requests/:id/finalize-date` with `{ date: "2026-05-15" }`.
  2. System validates the date is one of the proposed dates.
  3. System performs the same finalization as SUC-004 steps 5–9 using the admin-specified date.
- **Postconditions**: Same as SUC-004.
- **Acceptance Criteria**:
  - [ ] Admin can finalize any proposed date regardless of headcount
  - [ ] The specified date must be in the request's proposed dates; otherwise 422
  - [ ] Finalization triggers same side effects as auto-finalization (iCal, notifications)
  - [ ] Request not in `dates_proposed` returns 422

---

## SUC-006: Confirmed Registrants Receive iCal Invite

- **Actor**: System
- **Preconditions**: An `EventRequest` has just been finalized (moved to `confirmed`). Registrants with `status: confirmed` exist.
- **Main Flow**:
  1. System generates an `.ics` file with a VEVENT containing: event title (class name), date/time, location (from the request), organizer (admin email).
  2. System sends email to each confirmed registrant with the `.ics` as an attachment.
- **Postconditions**: iCal invite emails dispatched to confirmed registrants.
- **Acceptance Criteria**:
  - [ ] Email contains an `.ics` attachment with valid VEVENT data
  - [ ] Only registrants with `status: confirmed` receive the invite
  - [ ] Email `Reply-To` is set to the event's `emailThreadAddress` (if set)

---

## SUC-007: Non-Matching Registrants Receive Date Change Notification

- **Actor**: System
- **Preconditions**: An `EventRequest` has just been finalized. Registrants with `status: declined` (voted for a different date) exist.
- **Main Flow**:
  1. System sends a notification email to each declined registrant explaining that a different date was selected and providing the confirmed date.
- **Postconditions**: Date-change notification emails dispatched.
- **Acceptance Criteria**:
  - [ ] Only registrants with `status: declined` receive the notification
  - [ ] Email includes the confirmed date and event details
  - [ ] Email `Reply-To` is set to the event's `emailThreadAddress` (if set)

---

## SUC-008: Instructor Receives Reminder and Times Out

- **Actor**: System (scheduled job)
- **Preconditions**: An `InstructorAssignment` exists with `status: pending` and `notifiedAt` past the reminder threshold.
- **Main Flow**:
  1. `assignment-reminders` job runs.
  2. For each pending assignment past the reminder threshold (but not yet timed out): send `sendMatchReminder()`, increment `reminderCount`.
  3. For each pending assignment past the timeout threshold: set `status: timed_out`, call `MatchingService` to find the next candidate. If a next candidate exists, create a new `InstructorAssignment` and send match notification. If no candidates remain, notify admin of "no instructor available."
- **Postconditions**: Reminders sent; timed-out assignments advance to next instructor or escalate to admin.
- **Acceptance Criteria**:
  - [ ] Reminder email sent for pending assignments past `REMINDER_INTERVAL_HOURS`
  - [ ] `reminderCount` incremented after each reminder
  - [ ] Assignment set to `timed_out` after `ASSIGNMENT_TIMEOUT_HOURS`
  - [ ] Next matched instructor gets a new assignment and notification
  - [ ] If no candidates remain, admin is notified

---

## SUC-009: Voting Deadline Passes Without Quorum

- **Actor**: System (scheduled job)
- **Preconditions**: An `EventRequest` in `dates_proposed` status has a `votingDeadline` that has passed. No proposed date meets `minHeadcount`.
- **Main Flow**:
  1. `deadline-check` job runs.
  2. System finds requests in `dates_proposed` where `votingDeadline < now` and no date meets `minHeadcount`.
  3. System sends notification to requester and admin: "The voting deadline has passed without enough registrations. The event may be cancelled or rescheduled."
  4. The request remains in `dates_proposed` — admin must manually cancel or adjust.
- **Postconditions**: Deadline notification sent; request status unchanged (admin action required).
- **Acceptance Criteria**:
  - [ ] Notification sent when deadline passes without quorum
  - [ ] Requests with `votingDeadline` in the future are not affected
  - [ ] Requests already `confirmed` are not affected
  - [ ] System does not auto-cancel — admin must act
