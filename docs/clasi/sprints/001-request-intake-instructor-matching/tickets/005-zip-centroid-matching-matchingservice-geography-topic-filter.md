---
id: "005"
title: "Zip centroid matching — MatchingService geography & topic filter"
status: todo
use-cases:
  - SUC-001
  - SUC-002
depends-on:
  - "001"
  - "003"
github-issue: ""
todo: ""
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Zip centroid matching — MatchingService geography & topic filter

## Description

Implement the first two stages of `MatchingService`: topic filter and geography filter. Given a `classSlug` and requester `zip`, return the ranked list of `InstructorProfile` records whose topics include the slug and who are within range (either via `serviceZips` membership or Haversine distance ≤ `maxTravelMinutes`). Availability filtering (Pike13 API) is added in ticket 006. This ticket also exposes `GET /api/requests/availability` so the UI can check coverage before a requester fills out the full form.

## Acceptance Criteria

- [ ] A bundled static zip-centroid dataset is present at `server/src/data/zip-centroids.json`, covering US zip codes with lat/lng
- [ ] `MatchingService.findCandidatesByTopicAndGeo({ zip, classSlug })` returns only `InstructorProfile` records where `topics` includes `classSlug` AND the instructor is within range
- [ ] Geography filter uses `serviceZips` membership check if `serviceZips` is non-empty; otherwise uses Haversine distance converted to estimated drive minutes (fixed conversion: 1 minute ≈ 1.5 km)
- [ ] Results are sorted by distance, nearest first
- [ ] If the requester's zip or an instructor's `homeZip` is not in the centroid dataset, that zip is treated as unresolvable: an uncovered-zip error is returned for the requester zip; an instructor with unresolvable `homeZip` is skipped
- [ ] `GET /api/requests/availability?zip=&classSlug=` returns 200 + `{ available: true, slots: [...] }` if at least one candidate exists (slots is an empty array at this stage — availability is wired in ticket 006), or `{ available: false }` if no candidates
- [ ] `GET /api/requests/availability` returns 422 if `zip` or `classSlug` is missing or malformed

## Testing

- **Existing tests to run**: `npm run test:server`
- **New tests to write**: `tests/server/matching.test.ts` — topic filter (match/no-match), geography by radius (within/outside range), geography by `serviceZips`, unknown zip handling, sort order, and the availability endpoint.
- **Verification command**: `npm run test:server`

## Implementation Notes

- Zip centroid data source: a public-domain US zip code centroid dataset. Bundle only the fields needed (`zip`, `lat`, `lng`) to keep the file small.
- Haversine formula: implement inline in `server/src/services/matching.service.ts` — no external routing API.
- Drive-time estimate: `distanceKm / 1.5` (km per minute at avg speed). This is the v1 approximation; a routing API upgrade is deferred per spec §7.
- Service file: `server/src/services/matching.service.ts`.
- Route file: extend `server/src/routes/requests.ts`.
