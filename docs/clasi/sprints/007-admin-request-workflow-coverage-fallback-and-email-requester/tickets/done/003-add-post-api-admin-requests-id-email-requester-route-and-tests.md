---
id: '003'
title: Add POST /api/admin/requests/:id/email-requester route and tests
status: in-progress
use-cases:
- UC-007-03
depends-on:
- '002'
github-issue: ''
todo: admin-email-requester-with-thread-ai-asana.md
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Add POST /api/admin/requests/:id/email-requester route and tests

## Description

Add the server route that allows admins to send an outbound email to the requester, queued through the existing `EmailQueueService` and linked to the request via the new `requestId` field.

Route: `POST /api/admin/requests/:id/email-requester`
Auth: `requirePike13Admin`

Logic:
1. Validate `subject` and `body` are present in the request body; return 400 if missing.
2. Look up the `EventRequest` by `id`; return 404 if not found.
3. If `emailThreadAddress` is null, return 422 `{ error: 'no_thread_address' }`.
4. Call `emailQueueService.enqueue({ recipient: request.requesterEmail, subject, textBody: body, replyTo: request.emailThreadAddress, requestId: request.id })`.
5. Return 201 `{ queued: true }`.

Add this route to `server/src/routes/admin/requests.ts`.

## Acceptance Criteria

- [ ] `POST /api/admin/requests/:id/email-requester` returns 201 with valid payload.
- [ ] An `EmailQueue` row exists with `recipient = requesterEmail`, `replyTo = emailThreadAddress`, `requestId = id`.
- [ ] Returns 400 when `subject` is missing.
- [ ] Returns 400 when `body` is missing.
- [ ] Returns 404 when request does not exist.
- [ ] Returns 422 `{ error: 'no_thread_address' }` when `emailThreadAddress` is null.
- [ ] Returns 401/403 without an admin session.
- [ ] All server tests pass (`npm run test:server`).

## Testing

- **Existing tests to run**: `npm run test:server`
- **New tests to write** (`tests/server/admin-email-requester.test.ts`):
  - Happy path: POST with valid payload returns 201; verify EmailQueue row.
  - Missing subject: returns 400.
  - Missing body: returns 400.
  - No thread address: returns 422 with `error: 'no_thread_address'`.
  - Unknown request id: returns 404.
  - Unauthenticated: returns 401 or 403.
- **Verification command**: `npm run test:server`

## Files to Change

- `server/src/routes/admin/requests.ts` — add the new route
- `tests/server/admin-email-requester.test.ts` — new test file
