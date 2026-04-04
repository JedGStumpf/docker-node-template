---
id: '003'
title: "Admin sidebar navigation \u2014 add missing sprint 4-5 links"
status: in-progress
use-cases: []
depends-on: []
github-issue: ''
todo: ''
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Admin sidebar navigation — add missing sprint 4-5 links

## Description

Add missing admin pages to the `ADMIN_NAV` array in `client/src/components/AppLayout.tsx`. Pages built in sprints 4 and 5 are not linked in the sidebar, making them unreachable without typing the URL directly.

Missing links to add:
- `/admin/analytics` — "Analytics"
- `/admin/email-queue` — "Email Queue"

Also verify all other sprint 4-5 admin pages are linked (e.g. `/admin/equipment`, `/admin/instructors`, `/admin/requests`).

## Acceptance Criteria

- [ ] `/admin/analytics` appears in the admin sidebar as "Analytics"
- [ ] `/admin/email-queue` appears in the admin sidebar as "Email Queue"
- [ ] All existing admin nav links still work (no broken links)
- [ ] `npm run test:client` passes

## Testing

- **Existing tests to run**: `npm run test:client`
- **New tests to write**: A client test that renders `AppLayout` with an admin user and asserts both new nav links are present
- **Verification command**: `npm run test:client`
