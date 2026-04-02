---
sprint: "001"
status: approved
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Sprint 001 Use Cases

## SUC-001: Requester Submits Request for a Class in a Covered Zip Code

- **Actor**: Requester (parent, teacher, scout leader)
- **Preconditions**: At least one active instructor covers the requested zip code and teaches the requested class topic. Class is flagged `requestable` in `content.json`.
- **Main Flow**:
  1. Requester arrives at the event app with a class slug parameter.
  2. System fetches class metadata from `content.json` and confirms the class is requestable.
  3. Requester enters their zip code. `MatchingService` finds at least one available instructor.
  4. System displays a calendar of available date windows aggregated across matching instructors (no instructor names shown).
  5. Requester selects one or more preferred dates.
  6. Requester fills in the intake form: name, email, group type, expected headcount, free-text location, optional external registration URL.
  7. Requester submits. System saves the request in `unverified` status and dispatches a verification email with a tokenized link.
  8. Requester sees a holding page: "Check your email to verify your request."
- **Postconditions**: `EventRequest` record exists with `status: unverified`; verification email sent.
- **Acceptance Criteria**:
  - [ ] `POST /api/requests` with valid input returns 201 and an `EventRequest` ID
  - [ ] `EventRequest.status` is `unverified` after creation
  - [ ] Verification email is dispatched (captured by email mock in tests)
  - [ ] `verificationExpiresAt` is set to ~1 hour after creation

---

## SUC-002: Requester Submits Request for a Class in an Uncovered Zip Code

- **Actor**: Requester
- **Preconditions**: No active instructor covers the requested zip code for the requested topic.
- **Main Flow**:
  1. Requester enters their zip code.
  2. `MatchingService` returns zero candidates.
  3. System returns a no-coverage response.
- **Postconditions**: No `EventRequest` record created; requester receives a clear no-coverage message.
- **Acceptance Criteria**:
  - [ ] `GET /api/requests/availability?zip=&classSlug=` returns an empty availability list when no instructors match
  - [ ] `POST /api/requests` with an unmatched zip returns 422 with a meaningful error

---

## SUC-003: Request Verifies via Email Link Within One Hour

- **Actor**: Requester
- **Preconditions**: An `EventRequest` in `unverified` status exists with a valid token; fewer than 60 minutes have elapsed since creation.
- **Main Flow**:
  1. Requester clicks the verification link (`POST /api/requests/:id/verify` with token).
  2. System validates the token and checks expiry.
  3. System moves the request to `new` status.
  4. System creates `InstructorAssignment` records for top-ranked candidates and dispatches match notification emails.
- **Postconditions**: `EventRequest.status = new`; instructor notification emails dispatched.
- **Acceptance Criteria**:
  - [ ] `POST /api/requests/:id/verify` with valid token and within window returns 200 and `status: new`
  - [ ] Match notification emails dispatched for each candidate instructor
  - [ ] `InstructorAssignment` records created with `status: pending`

---

## SUC-004: Request Auto-Expires After One Hour Without Verification

- **Actor**: Background expiry scheduler
- **Preconditions**: An `EventRequest` in `unverified` status exists and `verificationExpiresAt` is in the past.
- **Main Flow**:
  1. Expiry job runs on its interval.
  2. Job finds `unverified` requests past expiry.
  3. Job deletes those records.
- **Postconditions**: Expired `EventRequest` records are removed. Subsequent clicks on the expired link return an expiration error.
- **Acceptance Criteria**:
  - [ ] `RequestService.expireUnverified()` deletes only records past `verificationExpiresAt`
  - [ ] `POST /api/requests/:id/verify` with an expired/deleted request returns 404 or 410
  - [ ] `POST /api/requests/:id/verify` with valid token but after expiry window returns 410

---

## SUC-005: Instructor Logs In via Pike13 OAuth and Sets Up Profile

- **Actor**: Instructor
- **Preconditions**: Instructor has a Pike13 account. No `InstructorProfile` exists for their Pike13 user ID.
- **Main Flow**:
  1. Instructor clicks "Log in with Pike13"; app redirects to Pike13 OAuth.
  2. Instructor authenticates and grants consent.
  3. Pike13 redirects to `/api/auth/pike13/callback`; app exchanges code for token and retrieves user profile.
  4. App creates a session. App redirects to profile setup (no existing profile found).
  5. Instructor fills in topics, home zip, `max_travel_minutes`.
  6. `PUT /api/instructor/profile` creates the `InstructorProfile`.
- **Postconditions**: `InstructorProfile` created and linked to Pike13 user ID; instructor has an authenticated session.
- **Acceptance Criteria**:
  - [ ] Successful OAuth callback creates a session with `pike13UserId`
  - [ ] `GET /api/instructor/profile` returns 404 if no profile exists yet
  - [ ] `PUT /api/instructor/profile` with valid data creates the profile and returns 200
  - [ ] Profile is retrievable via `GET /api/instructor/profile` after creation

---

## SUC-006: Instructor Receives and Accepts a Match Notification

- **Actor**: Instructor
- **Preconditions**: `InstructorAssignment` in `pending` status exists; match notification email sent with a `notificationToken`.
- **Main Flow**:
  1. Instructor clicks the "Accept" link in the notification email.
  2. `POST /api/instructor/assignments/:id/accept` validates the token.
  3. App sets `InstructorAssignment.status = accepted` and `respondedAt = now()`.
- **Postconditions**: Assignment accepted; reminder job stops for this assignment.
- **Acceptance Criteria**:
  - [ ] `POST /api/instructor/assignments/:id/accept` with valid token returns 200
  - [ ] `InstructorAssignment.status` is `accepted` after call
  - [ ] Subsequent reminder job run does not send another reminder for this assignment

---

## SUC-007: Instructor Declines or Times Out; System Advances to Next Match

- **Actor**: Instructor / Background scheduler
- **Preconditions**: `InstructorAssignment` in `pending` status exists.
- **Main Flow (decline)**:
  1. Instructor clicks "Decline" link.
  2. App sets `InstructorAssignment.status = declined`.
  3. App finds next-ranked matching instructor, creates new `InstructorAssignment`, dispatches notification email.
- **Main Flow (timeout)**:
  1. Reminder/timeout job identifies `pending` assignments past the timeout threshold.
  2. Job marks assignment `timed_out`.
  3. Job advances to next instructor (same as decline path step 3).
- **Postconditions**: Old assignment is `declined` or `timed_out`; new `InstructorAssignment` created for next candidate; notification email dispatched.
- **Acceptance Criteria**:
  - [ ] `POST /api/instructor/assignments/:id/decline` with valid token sets status to `declined` and triggers next-match logic
  - [ ] `InstructorService.sendReminders()` marks timed-out assignments and advances to next match
  - [ ] If no further candidates exist, admin is notified (no-match-available email)

---

## SUC-008: Admin Views Requests in New Status

- **Actor**: Admin (Pike13 admin role)
- **Preconditions**: Admin is authenticated. At least one `EventRequest` with `status: new` exists.
- **Main Flow**:
  1. Admin calls `GET /api/admin/requests`.
  2. System validates admin session.
  3. System returns list of requests with `status: new` (optionally including `unverified`).
- **Postconditions**: Admin has the list of new requests.
- **Acceptance Criteria**:
  - [ ] `GET /api/admin/requests` returns 200 with a list of requests when called by an authenticated admin
  - [ ] Returns 401 when called without authentication
  - [ ] Returns 403 when called by an authenticated non-admin (instructor role)
  - [ ] Response includes key fields: `id`, `requesterName`, `classSlug`, `zipCode`, `groupType`, `expectedHeadcount`, `status`, `createdAt`
