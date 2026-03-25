---
id: '006'
title: "Pike13 availability reading \u2014 appointment slots"
status: done
use-cases:
- SUC-001
- SUC-002
depends-on:
- '002'
- '005'
github-issue: ''
todo: ''
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Pike13 availability reading — appointment slots

## Description

Implement the real `Pike13Client.getAvailableSlots` method and wire it into the third stage of `MatchingService`. After topic and geography filtering, the system queries Pike13 for each candidate instructor's appointment slots within a look-ahead window. Slots are aggregated across all matching instructors (without revealing which instructor has which slot) and returned as the available date list shown to requesters.

## Acceptance Criteria

- [x] `RealPike13Client.getAvailableSlots(pike13UserId, dateRange)` calls the Pike13 appointments API and returns an array of `{ start: Date, end: Date }` windows
- [x] `MatchingService.findMatchingInstructors({ zip, classSlug, lookAheadDays? })` runs all three stages (topic, geo, availability) and returns only instructors with at least one available slot in the window
- [x] `GET /api/requests/availability?zip=&classSlug=` now includes `slots` in the response: an array of ISO-8601 date strings aggregated from all matching instructors (deduplicated, sorted ascending, instructor identities not exposed)
- [x] Look-ahead window defaults to 90 days from today; configurable via `AVAILABILITY_LOOKAHEAD_DAYS`
- [x] If a Pike13 API call fails for one instructor, that instructor is skipped (degraded gracefully) and the others are still returned
- [x] `MockPike13Client.getAvailableSlots` returns a configurable set of slots — tests use the mock only

## Testing

- **Existing tests to run**: `npm run test:server`
- **New tests to write**: Extend `tests/server/matching.test.ts` with availability-stage tests using `MockPike13Client`: instructor with slots (included), instructor with no slots (excluded), partial failure (one instructor's mock throws; others still returned), deduplicated slot aggregation.
- **Verification command**: `npm run test:server`

## Implementation Notes

- Pike13 appointments API endpoint: `GET /api/v2/staff_members/{pike13_user_id}/appointments`. Consult Pike13 API docs for auth header format (Bearer token from OAuth).
- For the mock client, make the slot list configurable per `pike13UserId` so tests can set up specific scenarios.
- `getAvailableSlots` in `RealPike13Client` needs an OAuth access token. In Sprint 1, use the instructor's stored token from the session (or a service account token if configured). Token refresh is deferred to a future sprint.
- Service account token for server-side availability queries: env var `PIKE13_SERVICE_TOKEN`. If not set, availability queries for non-logged-in instructors will be skipped (degrade gracefully).
