---
ticket: "003"
sprint: "006"
status: in-progress
---

# Ticket 003 Plan: Admin sidebar navigation — add missing sprint 4-5 links

## Approach

Insert `{ to: '/admin/analytics', label: 'Analytics' }` into the `ADMIN_NAV` array in
`client/src/components/AppLayout.tsx`, positioned between Requests and Email Queue.

Also add a client test asserting the Analytics nav link is present when an admin user
renders AppLayout.

## Files to Modify

- `client/src/components/AppLayout.tsx` — add Analytics nav item
- `tests/client/AppLayout.test.tsx` — new test file asserting Analytics link presence

## Testing Plan

- Run `npm run test:client` — new test must pass, no regressions.

## Documentation Updates

- None required.
