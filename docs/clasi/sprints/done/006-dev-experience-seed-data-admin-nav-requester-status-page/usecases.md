---
status: draft
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Sprint 006 Use Cases

## SUC-001: Developer Seeds a Fresh Dev Database
Parent: UC-02 (Request Intake)

- **Actor**: Developer
- **Preconditions**: Fresh SQLite dev database exists; `DATABASE_URL` points
  to `file:./data/dev.db`.
- **Main Flow**:
  1. Developer runs `npx prisma db seed` (or `npm run seed`).
  2. Script upserts 3 instructor profiles with varied zip codes and topics.
  3. Script upserts 2 registered sites with address and zip data.
  4. Script upserts 1 admin user (`admin@jointheleague.org`).
  5. Developer opens the intake form, sees classes loaded, selects a class
     and zip code, receives instructor coverage, and submits a request.
- **Postconditions**: Dev database has enough data to exercise the full
  request flow without additional manual setup.
- **Acceptance Criteria**:
  - [ ] `npx prisma db seed` completes without errors on a fresh SQLite db.
  - [ ] Seed is idempotent — running it twice does not create duplicates.
  - [ ] At least one seeded instructor covers the zip codes in the fixture
        classes (so a request from a nearby zip shows coverage).
  - [ ] Intake form loads at least 5 requestable classes after seed.

## SUC-002: Developer Loads Classes from Local Fixture
Parent: UC-02 (Request Intake)

- **Actor**: Developer
- **Preconditions**: `CONTENT_JSON_URL` in `config/dev/public.env` points to
  `file:///workspaces/docker-node-template/tests/fixtures/content.json`.
- **Main Flow**:
  1. Developer starts the dev server.
  2. Intake form fetches `GET /api/content` which reads the fixture file.
  3. Form displays the full class list (Python, Scratch, Robotics, Game
     Design, JavaScript, Web Design).
  4. Developer selects a class and proceeds with the intake flow.
- **Postconditions**: Intake form is fully functional without internet access
  or a live `jointheleague.org/content.json`.
- **Acceptance Criteria**:
  - [ ] Fixture has at least 5 requestable classes.
  - [ ] Each class has a slug, title, topics array, age range, duration, and
        equipment list.
  - [ ] Topics in the fixture align with topics on seeded instructors.

## SUC-003: Admin Navigates to Analytics and Email Queue from Sidebar
Parent: UC-09 (Admin Dashboard)

- **Actor**: Admin
- **Preconditions**: Admin is logged in and viewing any page in the `/admin/`
  section.
- **Main Flow**:
  1. Admin sees sidebar with all admin nav links.
  2. Admin clicks "Analytics" — navigates to `/admin/analytics`.
  3. Admin clicks "Email Queue" — navigates to `/admin/email-queue`.
- **Postconditions**: Both pages render correctly with no 404 or white screen.
- **Acceptance Criteria**:
  - [ ] "Analytics" link appears in the admin sidebar.
  - [ ] "Email Queue" link appears in the admin sidebar (verify it remains
        present — it was already added but should be confirmed).
  - [ ] Both links navigate to the correct pages.

## SUC-004: Requester Checks Event Status via Tokenized Link
Parent: UC-01 (Requester Self-Service)

- **Actor**: Requester (unauthenticated)
- **Preconditions**: Requester submitted an event request and received a
  verification email containing a link to `/requests/:id?token=:token`.
- **Main Flow**:
  1. Requester clicks the link in their email.
  2. Browser opens the status page without requiring login.
  3. Page displays: class title, current status (human-readable label),
     confirmed date (if set), registration count, and a link to the public
     event page once the request is confirmed.
  4. Requester bookmarks the page and checks back later.
- **Postconditions**: Requester is informed about their event's progress
  without needing to contact the League or wait for an email.
- **Alternative Flow (wrong token)**:
  - If `?token` does not match the request, server returns 403 and the page
    shows an "Access denied" error.
- **Alternative Flow (not found)**:
  - If the request ID does not exist, server returns 404 and the page shows
    a "Not found" error.
- **Acceptance Criteria**:
  - [ ] `GET /api/requests/:id/status?token=:token` returns 200 with safe
        subset of request fields when token matches.
  - [ ] Returns 403 when token does not match.
  - [ ] Returns 404 when request ID does not exist.
  - [ ] `RequesterStatus` page renders status, class title, confirmed date,
        and registration count without auth.
  - [ ] Page renders "Access denied" on 403 and "Not found" on 404.
  - [ ] Internal fields (assignedInstructorId, verificationToken,
        emailThreadAddress, asanaTaskId) are NOT exposed in the response.
