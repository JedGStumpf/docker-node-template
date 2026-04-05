---
id: "001"
title: "Remove coverage gate from POST /api/requests; auto-set no_instructor status"
status: done
use-cases:
  - UC-007-01
depends-on: []
github-issue: ""
todo: "allow-requests-without-instructor-coverage.md"
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Remove coverage gate from POST /api/requests; auto-set no_instructor status

## Description

`POST /api/requests` currently returns 422 `no_coverage` when no matching instructors are found for the submitted zip/class combination. This rejects legitimate requests that could be fulfilled later as coverage expands.

The fix:
1. Remove the early-return block (~lines 107–118 in `server/src/routes/requests.ts`) that checks coverage and returns 422.
2. After the silent geo-match, if no candidates are found (`error === 'uncovered_zip'` or `candidates.length === 0`), call `createRequest()` with `status: 'no_instructor'` and skip instructor-assignment notifications.
3. If candidates are found, proceed as before (status `'new'`, trigger matching).
4. Extend `RequestService.createRequest()` to accept an optional `status` parameter (default `'new'`).

The verification email is sent in both cases.

## Acceptance Criteria

- [x] `POST /api/requests` with an uncovered zip returns 201 (was 422).
- [x] The returned `status` field is `no_instructor`.
- [x] A verification email is enqueued regardless of coverage status.
- [x] Covered-zip submissions continue to return 201 with `status: 'new'` and trigger instructor matching.
- [x] The existing `no_coverage` test case in `tests/server/request-intake.test.ts` is updated to assert the new behavior (201 + `no_instructor`).
- [x] A test confirms covered-zip requests still produce `status: 'new'`.
- [x] All server tests pass (`npm run test:server`).

## Testing

- **Existing tests to run**: `npm run test:server` (specifically `tests/server/request-intake.test.ts`)
- **New tests to write**:
  - Update test: uncovered-zip submission returns 201 with `status: 'no_instructor'`
  - Confirm test: covered-zip submission returns 201 with `status: 'new'`
- **Verification command**: `npm run test:server`

## Files to Change

- `server/src/routes/requests.ts` — remove coverage gate block, add status branch
- `server/src/services/request.service.ts` — add optional `status` param to `createRequest()`
- `tests/server/request-intake.test.ts` — update and add test cases
