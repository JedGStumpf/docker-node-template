---
id: "009"
title: "Admin routes — email queue management, event capacity configuration"
status: todo
use-cases: [SUC-008, SUC-009]
depends-on: [002, 007]
github-issue: ""
todo: ""
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Admin routes — email queue management, event capacity configuration

## Description

Add admin routes for email queue visibility/retry and extend the existing admin request update route with `eventCapacity`.

**New routes:**
- `GET /api/admin/email-queue` — list email queue entries filtered by status (query param `?status=failed|dead|pending|sent`). Returns: id, recipient, subject, status, attempts, lastError, createdAt. Paginated with `?page=1&limit=20`.
- `POST /api/admin/email-queue/:id/retry` — reset a dead email to pending (calls `emailQueueService.retryDead()`). Returns the updated row.

**Modified route:**
- `PUT /api/admin/requests/:id` — add `eventCapacity` (Int, nullable) to the accepted body fields. Validates it's a positive integer or null.

Both new routes require admin auth (same middleware as existing admin routes).

## Acceptance Criteria

- [ ] `GET /api/admin/email-queue` returns filtered, paginated email queue entries
- [ ] `POST /api/admin/email-queue/:id/retry` resets dead email to pending
- [ ] Retry on non-dead email returns 422
- [ ] `PUT /api/admin/requests/:id` accepts `eventCapacity` field
- [ ] Non-admin access returns 403
- [ ] Invalid `eventCapacity` (negative, non-integer) returns 422

## Testing

- **Existing tests to run**: `npm run test:server` — existing admin tests must pass
- **New tests to write**: `tests/server/admin-email-queue.test.ts` — list with status filter, retry dead email, retry non-dead returns 422, auth required. Extend existing admin request tests for `eventCapacity` field.
- **Verification command**: `npm run test:server`
