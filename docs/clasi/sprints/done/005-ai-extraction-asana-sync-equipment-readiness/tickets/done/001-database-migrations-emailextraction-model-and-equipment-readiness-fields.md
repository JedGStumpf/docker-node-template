---
id: "001"
title: "Database migrations: EmailExtraction model and equipment readiness fields"
status: done
use-cases:
  - SUC-001
  - SUC-005
depends-on: []
github-issue: ""
todo: ""
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Database migrations: EmailExtraction model and equipment readiness fields

## Description

Add three additive Prisma migrations to support Sprint 5 features:

1. New `EmailExtraction` model — stores AI-extracted data from inbound emails.
2. New fields on `InstructorAssignment` — `equipmentStatus`, `equipmentCheckedAt`, `equipmentReminderCount`.
3. New field on `InstructorProfile` — `inventoryUserId`.

Also update `ServiceRegistry.clearAll()` to include `emailExtraction.deleteMany()` in FK-safe order (before `emailQueue.deleteMany()`).

### EmailExtraction model fields
- `id` — String, UUID, default cuid()
- `emailId` — String, FK to inbound email record
- `requestId` — String, FK to EventRequest
- `statusSignal` — String?, nullable (e.g., "confirmed", "cancelled", "rescheduled", "none")
- `actionItems` — String[] (JSONB in Postgres)
- `hostRegistrationCount` — Int?, nullable
- `appliedAt` — DateTime?, nullable (set when admin applies the signal)
- `createdAt` — DateTime, default now()

### InstructorAssignment additions
- `equipmentStatus` — String, default "unknown" (values: "ready", "pending_checkout", "unknown")
- `equipmentCheckedAt` — DateTime?, nullable
- `equipmentReminderCount` — Int, default 0

### InstructorProfile additions
- `inventoryUserId` — String?, nullable

## Acceptance Criteria

- [x] `npx prisma migrate dev` runs without error on a clean database.
- [x] `EmailExtraction` model is queryable via Prisma client.
- [x] `InstructorAssignment` rows have `equipmentStatus` defaulting to `"unknown"`.
- [x] `InstructorProfile` rows have `inventoryUserId` as null.
- [x] SQLite schema generated via `sqlite-push.sh` reflects all new fields.
- [x] `ServiceRegistry.clearAll()` includes `emailExtraction.deleteMany()` before `emailQueue.deleteMany()`.
- [x] `npm run test:server` passes green (no regressions from model changes).

## Testing

- **Existing tests to run**: `npm run test:server` (full suite — confirm clearAll() works in test teardown)
- **New tests to write**: None required for migrations alone; coverage comes from service tests in subsequent tickets.
- **Verification command**: `npm run test:server`
