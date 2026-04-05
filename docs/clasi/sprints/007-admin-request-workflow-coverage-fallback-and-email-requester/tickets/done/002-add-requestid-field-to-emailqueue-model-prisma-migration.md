---
id: '002'
title: Add requestId field to EmailQueue model (Prisma migration)
status: done
use-cases:
- UC-007-03
- UC-007-04
depends-on: []
github-issue: ''
todo: admin-email-requester-with-thread-ai-asana.md
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Add requestId field to EmailQueue model (Prisma migration)

## Description

To support associating admin-sent emails with a specific `EventRequest` (for the thread view in ticket #004), add a nullable `requestId` field to the `EmailQueue` Prisma model.

Changes:
1. Add `requestId String?` to `EmailQueue` in `server/prisma/schema.prisma`.
2. Add an index on `requestId` for efficient thread view queries.
3. Add the optional relation to `EventRequest` (nullable FK — no cascading behavior needed; if a request is deleted, emails remain for audit purposes, so use `SetNull` or omit the relation constraint and leave as a bare string column).
4. Run `npx prisma migrate dev --name add-email-queue-request-id` (PostgreSQL) and regenerate SQLite schema via `server/prisma/sqlite-push.sh`.
5. Update `EmailQueueService.enqueue()` to accept optional `requestId` in the `EmailMessage` type.

## Acceptance Criteria

- [x] `EmailQueue` Prisma model has `requestId String?` field with an index.
- [x] Migration runs without error.
- [x] SQLite schema is updated via `sqlite-push.sh`.
- [x] `EmailQueueService.enqueue()` accepts optional `requestId`.
- [x] Existing callers of `enqueue()` (that don't pass `requestId`) continue to work.
- [x] All server tests pass after migration (`npm run test:server`).

## Testing

- **Existing tests to run**: `npm run test:server` — no functional changes, just schema addition.
- **New tests to write**: None required — covered by tickets #003 and #004 which use the new field.
- **Verification command**: `npm run test:server`

## Files to Change

- `server/prisma/schema.prisma` — add `requestId` field and index to `EmailQueue`
- `server/prisma/sqlite-push.sh` (run to regenerate SQLite schema)
- `server/src/services/email-queue.service.ts` — extend `EmailMessage` type with optional `requestId`
