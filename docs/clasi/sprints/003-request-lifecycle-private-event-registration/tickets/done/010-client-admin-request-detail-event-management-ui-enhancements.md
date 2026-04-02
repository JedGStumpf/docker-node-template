---
id: "010"
title: "Client — admin request detail & event management UI enhancements"
status: done
use-cases: [SUC-001, SUC-005]
depends-on: [006]
github-issue: ""
todo: ""
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Client — admin request detail & event management UI enhancements

## Description

Extend the existing admin UI components to support the full request lifecycle, event configuration, registration visibility, and manual date finalization.

**Admin request detail page enhancements** (existing `AdminRequestDetail` or similar component):

1. **Status transition controls** — Buttons/dropdowns to advance the request through the status lifecycle. Show only valid transitions from the current status (e.g., from `discussing` show "Propose Dates" and "Cancel"). Calls `PUT /api/admin/requests/:id/status` with the selected status and any required data.

2. **Date proposal form** — When transitioning to `dates_proposed`, show a form to select multiple proposed dates (date picker). Optionally set `minHeadcount` and `votingDeadline`.

3. **Event configuration panel** — Editable fields for `minHeadcount`, `votingDeadline`, `eventType`. Calls `PUT /api/admin/requests/:id` to save. Only shown when request has entered `discussing` or later status.

4. **Registration summary view** — When request is in `dates_proposed` or `confirmed`, show a table of registrations from `GET /api/events/:requestId/registrations`. Display: attendee name, email, number of kids, which dates they can attend, status. Show per-date totals with threshold indicator.

5. **Shareable registration link** — When `registrationToken` exists, show a copyable link: `{baseUrl}/events/{requestId}?token={registrationToken}`.

6. **Manual finalize button** — When request is in `dates_proposed`, show a "Finalize Date" button per proposed date (or a dropdown). Calls `POST /api/admin/requests/:id/finalize-date`.

**Admin requests list enhancements** (existing `AdminRequestsV2` component):

7. **Status filter update** — Add `dates_proposed`, `confirmed`, `completed` to the status filter options (currently only filters by `new`, `discussing`, `cancelled` etc.).

## Acceptance Criteria

- [x] Status transition buttons show only valid transitions from current status
- [x] "Propose Dates" transition includes date picker for proposed dates and optional minHeadcount/votingDeadline
- [x] Event configuration panel allows editing minHeadcount, votingDeadline, eventType
- [x] Registration summary table displays all registrations with per-date vote tallies
- [x] Shareable registration link shown and copyable when registrationToken exists
- [x] "Finalize Date" button triggers manual finalization
- [x] Status filter on requests list includes all lifecycle statuses
- [x] Existing admin request list and detail functionality preserved
- [x] All new controls properly handle loading/error states

## Testing

- **Existing tests to run**: `tests/client/AdminRequestsV2.test.tsx`
- **New tests to write**: Update `tests/client/AdminRequestsV2.test.tsx` with new status filter options; new `tests/client/AdminEventManagement.test.tsx` — status transition controls render correctly, event config panel saves, registration summary displays data, finalize button triggers API call
- **Verification command**: `npm run test:client`
