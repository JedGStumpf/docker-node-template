---
id: "001"
title: "Request Intake & Instructor Matching"
status: planning
branch: sprint/001-request-intake-instructor-matching
use-cases:
  - SUC-001
  - SUC-002
  - SUC-003
  - SUC-004
  - SUC-005
  - SUC-006
  - SUC-007
  - SUC-008
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Sprint 001: Request Intake & Instructor Matching

## Goals

Deliver the end-to-end core flow: a requester clicks "Request this class" on jointheleague.org, enters a zip code, sees instructor-availability dates, fills in group details, submits the form, verifies their email, and the request arrives in `new` status. Instructors can log in via Pike13 OAuth, set up their profile, and be matched to incoming requests — accepting or declining via an email consent flow, with automatic fallthrough to the next instructor on timeout.

## Problem

There is no system to handle inbound Tech Club event requests. Requests currently arrive ad hoc via email or word of mouth and require manual instructor matching, availability checking, and coordination. Sprint 1 builds the foundation: data models, authentication, the geographic/topic matching engine, and the core request intake and consent workflow.

## Solution

1. Stand up Prisma models for `InstructorProfile`, `EventRequest` (unverified + new only), and `InstructorAssignment`.
2. Implement Pike13 OAuth for instructors and admins, with a test-login endpoint for automated tests.
3. Build a `ContentService` that reads and caches the class catalog from jointheleague.org's `content.json`.
4. Build a `MatchingService` using zip-centroid Haversine distance and `max_travel_minutes`.
5. Integrate Pike13 appointments API (read-only) to surface instructor availability.
6. Implement the request intake API (`POST /api/requests`), verification email, and auto-expiry.
7. Implement the instructor consent flow: match notification email, accept/decline endpoints, configurable reminder cadence, and timeout-to-next-instructor.
8. Provide a minimal admin view of requests in `new` status.

## Success Criteria

- A requester can submit a request for a requestable class, receive a verification email, click the link within one hour, and see the request move to `new` status.
- Requests not verified within one hour are automatically purged.
- A matched instructor receives a notification email and can accept or decline; declining (or timing out) causes the system to advance to the next matched instructor.
- An authenticated admin can list requests in `new` status.
- All server-side behaviour is covered by Vitest + Supertest tests using SQLite (no real Pike13 or SES calls in tests).

## Scope

### In Scope

- Prisma schema: `InstructorProfile`, `EventRequest` (`unverified` + `new`), `InstructorAssignment`
- Pike13 OAuth login flow (`/api/auth/pike13`) for instructors and admins
- Test-login endpoint (`POST /api/auth/test-login`) for test suite use
- Instructor profile API: `GET /api/instructor/profile`, `PUT /api/instructor/profile`
- `ContentService`: fetch and cache requestable classes from `content.json`
- Zip-centroid matching: static zip→lat/lng table, Haversine distance, drive-time estimate
- Pike13 appointments API client (read-only): map appointment slots to available date windows
- Request intake: `POST /api/requests` (validate, persist unverified, dispatch verification email)
- Request detail: `GET /api/requests/:id`
- Request verification: `POST /api/requests/:id/verify` (token check, 1 hr window)
- Background job: purge expired unverified requests
- Instructor matching: `MatchingService` (topic + geography + availability)
- Instructor consent flow: match notification email, `POST /api/instructor/assignments/:id/accept`, `POST /api/instructor/assignments/:id/decline`, reminder job, timeout-to-next logic
- Admin requests view: `GET /api/admin/requests` (lists `new` + `unverified`, requires admin session)
- Email service: outbound-only; captured to in-memory mock in tests
- Site picker: free-text location field only (registered sites are Sprint 2)

### Out of Scope

- Per-request email address provisioning (SES routing) — Sprint 2
- Site registration and site rep accounts — Sprint 2
- Asana task creation — Sprint 2
- Admin full dashboard with search/filter — Sprint 2
- Pike13 write-back (booking confirmed instructor) — Phase 2
- Registration flows (date voting, headcount, iCal) — Phase 2
- Meetup integration — Phase 2
- FEAT-1 Native Registration — Phase 2

## Test Strategy

All server tests use Vitest + Supertest against the Express app with a SQLite database (`file:./data/test.db`). File parallelism is disabled (SQLite single-writer constraint). Authentication in tests uses `POST /api/auth/test-login` — no mocking of session middleware. Pike13 API calls are mocked via a Pike13 client interface injected into services. Outbound email is captured via an in-memory mock email transport injected into `EmailService`. Each test suite is responsible for seeding and cleaning its own data. Coverage target: happy path + auth/error path for every new route.

## Architecture Notes

- Services follow the `ServiceRegistry` pattern: `ContentService`, `MatchingService`, `RequestService`, `InstructorService`, `EmailService`, `Pike13Client`.
- Dual-DB support: Prisma ORM methods only; no PostgreSQL-specific SQL. SQLite used in dev and test; PostgreSQL in production.
- Email service is outbound-only in Sprint 1. The per-request email address (SES routing) is a Sprint 2 concern.
- Zip centroid data is a static JSON/CSV bundled with the server — no external API call at match time.
- Reminder and expiry jobs use a simple interval-based scheduler (no external queue); acceptable for Sprint 1 load.

## GitHub Issues

(None yet.)

## Definition of Ready

Before tickets can be created, all of the following must be true:

- [x] Sprint planning documents are complete (sprint.md, use cases, architecture)
- [x] Architecture review passed
- [x] Stakeholder has approved the sprint plan

## Tickets

(To be created after sprint approval.)
