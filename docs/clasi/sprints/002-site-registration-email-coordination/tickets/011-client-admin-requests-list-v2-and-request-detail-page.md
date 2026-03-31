---
id: "011"
title: "Client: Admin requests list v2 and request detail page"
status: todo
use-cases: [SUC-007, SUC-008]
depends-on: ["009"]
github-issue: ""
todo: ""
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Client: Admin requests list v2 and request detail page

## Description

Upgrade the existing admin requests list page and add a new per-request detail page.

**Admin requests list page upgrades:**
- Add status filter tabs (All / New / Discussing / Scheduled / Cancelled) — clicking a tab appends `?status=` to the API call
- Add search input — debounced, appends `?search=` to the API call
- Add pagination controls (previous/next, current page indicator) using `page`/`limit` query params
- Each row in the list is now clickable and navigates to the request detail page

**New admin request detail page** (`/admin/requests/:id`):
- Fetches from `GET /api/admin/requests/:id`
- Displays: requester info, topic/location, status badge, assigned site (with link), email thread address, Asana task link (if present), instructor candidates / matched instructor
- Status override: dropdown + "Update Status" button that calls `PUT /api/admin/requests/:id/status`

## Acceptance Criteria

- [ ] Status filter tabs appear on the admin requests list; selecting one filters the visible requests
- [ ] Search input filters by requester name/email; clears filter when emptied
- [ ] Pagination shows correct page controls and navigates correctly
- [ ] Clicking a request row navigates to `/admin/requests/:id`
- [ ] Request detail page displays all key fields including site, thread address, Asana link
- [ ] Status override dropdown with update button works and refreshes the displayed status
- [ ] Detail page shows a meaningful UI when Asana task ID or thread address is absent (not broken)

## Testing

- **Existing tests to run**: `npm run test:client`
- **New tests to write**: Tests for the status filter tab interaction and the request detail page status override using mocked API responses
- **Verification command**: `npm run test:client`
