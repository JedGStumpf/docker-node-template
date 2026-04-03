---
id: "002"
title: "EmailQueueService and EmailService refactoring"
status: todo
use-cases: [SUC-007, SUC-008]
depends-on: [001]
github-issue: ""
todo: "outbound-email-queue-retry.md"
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# EmailQueueService and EmailService refactoring

## Description

Create `EmailQueueService` to manage the outbound email queue lifecycle. Refactor `EmailService` so all public methods enqueue messages instead of sending directly. Add a `flushQueue()` test helper so existing tests continue to work.

**EmailQueueService methods:**
- `enqueue(message: EmailMessage)` — insert row into `EmailQueue` with status `pending`.
- `processPending(transport: IEmailTransport, batchSize?)` — query pending/retryable rows (Postgres: `FOR UPDATE SKIP LOCKED`; SQLite: simple query), send each, update status. Backoff schedule: `[60, 300, 900, 3600, 14400]` seconds. After 5 failures → `dead`.
- `listFailed(filters?)` — return failed/dead rows for admin.
- `retryDead(id: string)` — reset dead row to pending.

**EmailService changes:**
- Constructor accepts `EmailQueueService` alongside `IEmailTransport`.
- All `send*()` methods call `this.emailQueue.enqueue()` instead of `this.transport.send()`.
- Transport is stored for use by the queue worker only.

**Test helper:** Add `flushQueue(services: ServiceRegistry)` to test utilities that calls `emailQueueService.processPending(transport, 100)`. Update all existing email tests to call `flushQueue()` after the action under test before checking `InMemoryEmailTransport.sent`.

**ServiceRegistry:** Add `emailQueue: EmailQueueService` property.

## Acceptance Criteria

- [ ] `EmailQueueService` exists with `enqueue()`, `processPending()`, `listFailed()`, `retryDead()` methods
- [ ] `EmailService` enqueues messages instead of sending directly
- [ ] `processPending()` uses `FOR UPDATE SKIP LOCKED` on Postgres, simple query on SQLite
- [ ] Exponential backoff: 60s, 300s, 900s, 3600s, 14400s
- [ ] After 5 failed attempts, status is set to `dead`
- [ ] `flushQueue()` test helper exists and works
- [ ] All existing email tests pass after adding `flushQueue()` calls
- [ ] `ServiceRegistry.clearAll()` includes `emailQueue.deleteMany()`

## Testing

- **Existing tests to run**: `npm run test:server` — all tests must pass after refactoring
- **New tests to write**: `tests/server/email-queue.test.ts` — enqueue creates row, processPending sends and marks sent, failed retry with backoff, dead after 5 attempts, retryDead resets
- **Verification command**: `npm run test:server`
