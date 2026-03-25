---
id: "010"
title: "Admin requests view"
status: todo
use-cases:
  - SUC-008
depends-on:
  - "002"
  - "007"
github-issue: ""
todo: ""
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Admin requests view

## Description

Implement `GET /api/admin/requests` — a protected endpoint that allows authenticated admins to list event requests. Sprint 1 scope is minimal: return requests in `new` and `unverified` statuses with key fields. This gives Jed and other League staff basic visibility into the incoming pipeline.

## Acceptance Criteria

- [ ] `GET /api/admin/requests` returns 200 + JSON array of requests for an authenticated admin
- [ ] Response includes fields: `id`, `classSlug`, `requesterName`, `requesterEmail`, `groupType`, `zipCode`, `expectedHeadcount`, `status`, `createdAt`
- [ ] By default, returns requests with `status: new`; supports optional query param `?status=unverified` to filter
- [ ] Results are sorted by `createdAt` descending (most recent first)
- [ ] Returns 401 if the caller has no session
- [ ] Returns 403 if the caller is authenticated but has `role: instructor` (not admin)
- [ ] Each request in the response includes an `assignments` summary: count of `pending`, `accepted`, `declined`, `timed_out` assignments

## Testing

- **Existing tests to run**: `npm run test:server`
- **New tests to write**: `tests/server/admin-requests.test.ts` — happy path (admin sees new requests), filter by status=unverified, 401 unauthenticated, 403 instructor-role, empty list (no requests), assignment summary counts.
- **Verification command**: `npm run test:server`

## Implementation Notes

- Use `requireAdmin` middleware from ticket 002.
- Route file: `server/src/routes/admin.ts`.
- Use Prisma `include: { assignments: true }` to fetch assignments, then map to summary counts in the service layer.
- This is a read-only endpoint. No write operations.
