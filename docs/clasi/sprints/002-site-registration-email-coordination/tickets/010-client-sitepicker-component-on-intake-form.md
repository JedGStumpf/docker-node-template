---
id: "010"
title: "Client: SitePicker component on intake form"
status: todo
use-cases: [SUC-003]
depends-on: ["005"]
github-issue: ""
todo: ""
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Client: SitePicker component on intake form

## Description

Add a `SitePicker` component to the intake form that lets requesters select a recognised venue from a list, with free-text fallback if they don't find their location.

**`SitePicker` component** (`client/src/components/SitePicker.tsx`):
- Fetches site list from `GET /api/sites` on mount
- Renders an autocomplete/select input showing `name` + `city, state`
- When a site is selected, sets `registeredSiteId` in the form state
- Includes a "Not listed" option that clears `registeredSiteId` and shows the existing free-text location field
- The existing location field (if any) becomes the fallback when nothing is selected

Integrate `SitePicker` into the request intake form page. Pass selected `registeredSiteId` with the `POST /api/requests` submission.

## Acceptance Criteria

- [ ] `SitePicker` renders a list of sites fetched from `GET /api/sites`
- [ ] Selecting a site sets `registeredSiteId` in the form
- [ ] Choosing "Not listed" clears `registeredSiteId` and shows the free-text location field
- [ ] Intake form submits `registeredSiteId` (or null) with the request
- [ ] Empty site list (no sites registered) shows only the free-text field with no autocomplete
- [ ] Component renders correctly without breaking existing form functionality

## Testing

- **Existing tests to run**: `npm run test:client`
- **New tests to write**: `tests/client/SitePicker.test.tsx` — renders site list from mock API, selecting site sets form state, "Not listed" resets to free-text
- **Verification command**: `npm run test:client`
