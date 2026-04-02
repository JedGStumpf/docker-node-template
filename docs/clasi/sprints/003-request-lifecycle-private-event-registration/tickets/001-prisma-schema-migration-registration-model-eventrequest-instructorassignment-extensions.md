---
id: '001'
title: "Prisma schema migration \u2014 Registration model, EventRequest & InstructorAssignment\
  \ extensions"
status: in-progress
use-cases:
- SUC-001
- SUC-002
- SUC-003
- SUC-004
- SUC-005
- SUC-006
- SUC-007
- SUC-008
- SUC-009
depends-on: []
github-issue: ''
todo: ''
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Prisma schema migration — Registration model, EventRequest & InstructorAssignment extensions

## Description

Add all Sprint 003 schema changes as a single Prisma migration. This is the foundation ticket — every other ticket depends on these models and fields existing.

**EventRequest additions** (all nullable or defaulted — additive, backward-compatible):
- `eventType` — String, default `"private"`. Values: `private`, `public`.
- `minHeadcount` — Int, nullable.
- `votingDeadline` — DateTime, nullable.
- `confirmedDate` — DateTime, nullable.
- `registrationToken` — String, unique, nullable.
- `proposedDates` — DateTime array (JSON string in SQLite).
- `assignedInstructorId` — FK to `InstructorProfile`, nullable.

**InstructorAssignment additions:**
- `timeoutAt` — DateTime, nullable.

**New model — `Registration`:**
- `id` — UUID, default auto.
- `requestId` — FK to `EventRequest`.
- `attendeeName` — String.
- `attendeeEmail` — String.
- `numberOfKids` — Int.
- `availableDates` — DateTime array (JSON string in SQLite).
- `status` — String, default `"interested"`. Values: `interested`, `confirmed`, `declined`.
- `createdAt` — DateTime, default now.
- Unique constraint on `(requestId, attendeeEmail)`.

**Backfill:** Existing pending `InstructorAssignment` records without `timeoutAt` should be set to `createdAt + 24 hours`.

## Acceptance Criteria

- [ ] Prisma migration created and applies cleanly (`npx prisma migrate dev`)
- [ ] `Registration` model exists with all specified fields and the unique constraint
- [ ] `EventRequest` has all 7 new fields with correct types, defaults, and FK
- [ ] `InstructorAssignment.timeoutAt` field exists as nullable DateTime
- [ ] Backfill sets `timeoutAt = createdAt + 24h` on existing pending assignments without `timeoutAt`
- [ ] `server/prisma/sqlite-push.sh` generates a working SQLite schema
- [ ] Generated Prisma client includes new types (`Registration`, updated `EventRequest`, updated `InstructorAssignment`)
- [ ] Existing server tests pass without modification (`npm run test:server`)

## Testing

- **Existing tests to run**: `npm run test:server` — all existing tests must pass; migration is additive so no regressions expected.
- **New tests to write**: None for this ticket (schema-only). Subsequent tickets test the models via service/route tests.
- **Verification command**: `npm run test:server`
