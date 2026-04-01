---
id: "009"
title: "Admin requests v2 — search, filter, pagination, detail, status override"
status: done
use-cases: [SUC-007, SUC-008]
depends-on: ["004"]
github-issue: ""
todo: ""
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Admin requests v2 — search, filter, pagination, detail, status override

## Description

Expand the admin requests API with search/filter/pagination and add per-request detail and status override endpoints.

**`GET /api/admin/requests`** (extended — backward compatible)
- New optional query params: `status` (filter by request status), `search` (match requester name or email, case-insensitive), `page` (default 1), `limit` (default 20, max 100)
- Callers without query params receive all requests as before (first page, no filter)
- Response: `{ requests: [...], total: number, page: number, limit: number }`
- Each request in the array now includes: `registeredSiteId`, `emailThreadAddress`, `asanaTaskId` (nullable fields)

**`GET /api/admin/requests/:id`**
- Full request detail: all `EventRequest` fields + linked `RegisteredSite` info + assigned instructor candidates + `asanaTaskId` link + `emailThreadAddress`
- 404 if not found

**`PUT /api/admin/requests/:id/status`**
- Body: `{ status }` — admin can set status to `cancelled`, `discussing`, `scheduled`, or back to `new`
- 200 with updated request; 400 if invalid status transition; 404 if not found

All three routes require admin session.

## Acceptance Criteria

- [ ] `GET /api/admin/requests` without params behaves identically to current implementation
- [ ] `status` filter returns only requests with matching status
- [ ] `search` filter matches requester name or email (case-insensitive, partial match)
- [ ] `page`/`limit` pagination works correctly; `total` reflects unfiltered count for current filters
- [ ] `GET /api/admin/requests/:id` returns full detail including site, instructor, thread address, Asana ID
- [ ] `PUT /api/admin/requests/:id/status` updates status and returns 200
- [ ] `PUT /api/admin/requests/:id/status` returns 400 for invalid status value
- [ ] All routes return 401/403 without admin session

## Testing

- **Existing tests to run**: `npm run test:server` (existing `admin-requests.test.ts` must still pass)
- **New tests to write**: `tests/server/admin-requests-v2.test.ts` — filter by status, search by name, search by email, pagination, get detail, status override, invalid status returns 400
- **Verification command**: `npm run test:server`
