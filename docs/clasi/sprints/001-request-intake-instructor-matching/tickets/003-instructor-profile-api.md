---
id: '003'
title: Instructor profile API
status: done
use-cases:
- SUC-005
depends-on:
- '001'
- '002'
github-issue: ''
todo: ''
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Instructor profile API

## Description

Implement `InstructorService` with `GET /api/instructor/profile` and `PUT /api/instructor/profile`. Instructors can read their own profile and create or update it with topics, home zip, travel range, and optional explicit service zip codes. This data feeds the matching engine in ticket 005.

## Acceptance Criteria

- [x] `GET /api/instructor/profile` returns 200 + profile JSON if a profile exists for the authenticated instructor's `pike13UserId`
- [x] `GET /api/instructor/profile` returns 404 if no profile exists yet (first login)
- [x] `GET /api/instructor/profile` returns 401 if the caller is not authenticated
- [x] `PUT /api/instructor/profile` with valid body creates the profile if it doesn't exist, or updates it if it does, and returns 200 + the updated profile
- [x] `PUT /api/instructor/profile` validates required fields (`topics` non-empty array, `homeZip` valid 5-digit zip, `maxTravelMinutes` positive integer); returns 422 on invalid input
- [x] `PUT /api/instructor/profile` returns 401 if not authenticated
- [x] Profile correctly round-trips `topics[]` and `serviceZips[]` arrays in both SQLite and PostgreSQL

## Testing

- **Existing tests to run**: `npm run test:server`
- **New tests to write**: `tests/server/instructor-profile.test.ts` — happy-path GET (profile exists), 404 GET (no profile), happy-path PUT (create), PUT update, PUT validation failures, 401 unauthenticated cases.
- **Verification command**: `npm run test:server`

## Implementation Notes

- `InstructorService.upsertProfile` uses Prisma `upsert` with `pike13UserId` as the unique key.
- `topics[]` values are class slugs from `content.json`. No content validation in Sprint 1 — accept any non-empty string array.
- If `serviceZips` is provided, it overrides the radius-based matching; if omitted/empty, `maxTravelMinutes` is used.
- Route file: `server/src/routes/instructor.ts`.
