---
id: '005'
title: "Public event routes \u2014 event info, registration, and registrations list"
status: done
use-cases:
- SUC-003
depends-on:
- 4
github-issue: ''
todo: ''
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Public event routes — event info, registration, and registrations list

## Description

Create a new route file `server/src/routes/events.ts` with three endpoints for the public event and registration flow. Register the router in `app.ts` under `/api/events`.

**Routes:**

1. `GET /api/events/:requestId` — Public event info page. Requires `token` query parameter. Calls `RegistrationService.getEventInfo()`. Returns class details (name, description from content.json), proposed dates, location, current vote tallies per date (kid count sums). No authentication required — token-gated.

2. `POST /api/events/:requestId/register` — Register for a private event. Accepts JSON body: `{ token, attendeeName, attendeeEmail, numberOfKids, availableDates }`. Calls `RegistrationService.createRegistration()`. Returns 201 with the registration record. Rate-limited to 10 requests per IP per 5 minutes via existing Express rate-limiter middleware.

3. `GET /api/events/:requestId/registrations` — Admin/instructor only (session auth). Calls `RegistrationService.listRegistrations()`. Returns all registrations with aggregated vote tallies per date.

**Input validation:**
- `attendeeName`: required, non-empty string, max 200 chars
- `attendeeEmail`: required, valid email format
- `numberOfKids`: required, integer ≥ 1
- `availableDates`: required, non-empty array of ISO date strings
- `token`: required on GET (query param) and POST (body)

## Acceptance Criteria

- [ ] `GET /api/events/:requestId?token=...` returns event info with vote tallies (200)
- [ ] `GET /api/events/:requestId` without token returns 401
- [ ] `GET /api/events/:requestId` with invalid token returns 401
- [ ] `POST /api/events/:requestId/register` with valid data returns 201 with registration record
- [ ] `POST /api/events/:requestId/register` without token returns 401
- [ ] `POST /api/events/:requestId/register` for request not in `dates_proposed` returns 422
- [ ] `POST /api/events/:requestId/register` with duplicate email for same request returns 409
- [ ] `POST /api/events/:requestId/register` with invalid `availableDates` (not subset of proposedDates) returns 422
- [ ] `POST /api/events/:requestId/register` rate-limited to 10 req/IP/5min
- [ ] `GET /api/events/:requestId/registrations` requires admin/instructor session — returns 401/403 for unauthenticated/unauthorized
- [ ] Input validation rejects missing/invalid fields with 400
- [ ] Router registered in `app.ts` at `/api/events`

## Testing

- **Existing tests to run**: `npm run test:server`
- **New tests to write**: `tests/server/private-registration.test.ts` (extends from ticket 004) — endpoint tests for all three routes: happy paths, token validation, auth checks, input validation, rate limiting verification
- **Verification command**: `npm run test:server`
