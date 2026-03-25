---
id: "001"
title: "Project skeleton & database setup"
status: todo
use-cases:
  - SUC-001
  - SUC-005
depends-on: []
github-issue: ""
todo: ""
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Project skeleton & database setup

## Description

Establish the Prisma schema for all Sprint 1 data models and ensure both SQLite (dev/test) and PostgreSQL (production) are usable. This ticket creates the foundation that every other Sprint 1 ticket depends on.

## Acceptance Criteria

- [ ] Prisma schema defines `InstructorProfile`, `EventRequest`, and `InstructorAssignment` models as specified in `architecture-update.md`
- [ ] `EventRequest.status` enum covers `unverified` and `new` (additional statuses present for future use)
- [ ] `InstructorAssignment.status` enum covers `pending`, `accepted`, `declined`, `timed_out`
- [ ] PostgreSQL migration file is generated and applies cleanly via `npx prisma migrate dev`
- [ ] SQLite variant is generated via `server/prisma/sqlite-push.sh` and applies cleanly
- [ ] Array fields (`topics`, `serviceZips`, `preferredDates`) store and retrieve correctly in both SQLite (JSON) and PostgreSQL (native arrays)
- [ ] `ServiceRegistry` is extended with placeholder entries for `ContentService`, `MatchingService`, `RequestService`, `InstructorService`, `EmailService`, and `Pike13Client`
- [ ] `npm run test:server` passes with no failures on the empty schema

## Testing

- **Existing tests to run**: `npm run test:server` (baseline — must not regress)
- **New tests to write**: A Prisma smoke test that creates one record of each new model type and reads it back, asserting field round-trip correctness (especially array fields in SQLite).
- **Verification command**: `npm run test:server`

## Implementation Notes

- Follow the dual-DB pattern in `server/src/services/prisma.ts`: Prisma client is initialized lazily based on `DATABASE_URL` format.
- Array fields need a JSON transformer in the SQLite adapter path (encode on write, decode on read). See existing template patterns or add helper utilities in `server/src/services/prisma.ts`.
- Do not add PostgreSQL-specific SQL anywhere. Use Prisma ORM methods only.
- The `ServiceRegistry` stubs can throw `ServiceError` with `NOT_IMPLEMENTED` until real implementations land in later tickets.
