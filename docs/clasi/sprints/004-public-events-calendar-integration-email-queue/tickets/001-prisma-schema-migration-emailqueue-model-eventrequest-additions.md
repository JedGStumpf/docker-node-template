---
id: '001'
title: "Prisma schema migration \u2014 EmailQueue model, EventRequest additions"
status: in-progress
use-cases:
- SUC-001
- SUC-002
- SUC-003
- SUC-004
- SUC-005
- SUC-007
- SUC-009
depends-on: []
github-issue: ''
todo: outbound-email-queue-retry.md
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Prisma schema migration — EmailQueue model, EventRequest additions

## Description

Add the new `EmailQueue` model and extend `EventRequest` with fields needed by all Sprint 004 features. This is the foundation ticket — all other tickets depend on this schema.

**EventRequest additions:** `meetupEventId` (String?), `meetupEventUrl` (String?), `meetupRsvpCount` (Int, default 0), `googleCalendarEventId` (String?), `eventCapacity` (Int?).

**New model — EmailQueue:** `id` (UUID), `recipient`, `subject`, `textBody`, `htmlBody?`, `replyTo?`, `attachments?` (String, JSON-encoded), `status` (pending/sent/failed/dead, default pending), `attempts` (Int, default 0), `nextRetryAt?`, `lastError?`, `createdAt`. Index on `(status, nextRetryAt)`.

Update `prisma.ts` SQLite array field handling if any new array fields are added (none needed — new fields are all scalar). Run `sqlite-push.sh` to regenerate SQLite schema.

## Acceptance Criteria

- [ ] Prisma migration adds 5 new columns to `EventRequest`
- [ ] Prisma migration creates `EmailQueue` table with all specified columns
- [ ] `EmailQueue` has index on `(status, nextRetryAt)`
- [ ] `sqlite-push.sh` succeeds and SQLite schema matches
- [ ] Existing tests pass without modification (`npm run test:server`)
- [ ] Prisma client regenerated with new types

## Testing

- **Existing tests to run**: `npm run test:server` — all existing tests must pass (schema is additive)
- **New tests to write**: None — schema validated by migration success and existing test suite
- **Verification command**: `npm run test:server`
