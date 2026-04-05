---
id: "004"
title: "Add GET /api/admin/requests/:id/email-thread route and tests"
status: todo
use-cases:
  - UC-007-04
depends-on:
  - "002"
github-issue: ""
todo: "admin-email-requester-with-thread-ai-asana.md"
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Add GET /api/admin/requests/:id/email-thread route and tests

## Description

Add the route that returns a unified thread view for a request — all outbound emails sent by admins and all inbound extraction records from requester replies.

Route: `GET /api/admin/requests/:id/email-thread`
Auth: `requirePike13Admin`

Logic:
1. Look up the `EventRequest`; return 404 if not found.
2. Query `EmailQueue` where `requestId = id`, ordered by `createdAt` ascending.
3. Query `EmailExtraction` where `requestId = id`, ordered by `createdAt` ascending.
4. Return `{ sent: EmailQueue[], received: EmailExtraction[] }`.

Add this route to `server/src/routes/admin/requests.ts`.

## Acceptance Criteria

- [ ] `GET /api/admin/requests/:id/email-thread` returns `{ sent, received }`.
- [ ] `sent` contains `EmailQueue` rows with `requestId = id`, sorted by `createdAt` ascending.
- [ ] `received` contains `EmailExtraction` rows for the request, sorted by `createdAt` ascending.
- [ ] Returns 404 for an unknown request id.
- [ ] Returns 401/403 without an admin session.
- [ ] Returns empty arrays when no emails or extractions exist.
- [ ] All server tests pass (`npm run test:server`).

## Testing

- **Existing tests to run**: `npm run test:server`
- **New tests to write** (in `tests/server/admin-email-requester.test.ts`):
  - Empty thread: returns `{ sent: [], received: [] }`.
  - With sent emails: sent array contains the enqueued emails in order.
  - With extraction records: received array contains them in order.
  - Unknown request id: returns 404.
  - Unauthenticated: returns 401 or 403.
- **Verification command**: `npm run test:server`

## Files to Change

- `server/src/routes/admin/requests.ts` — add the new route
- `tests/server/admin-email-requester.test.ts` — extend with thread view tests
