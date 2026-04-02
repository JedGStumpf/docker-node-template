---
id: "009"
title: "Client — public event page & registration form"
status: done
use-cases: [SUC-003, SUC-006, SUC-007]
depends-on: [005]
github-issue: ""
todo: ""
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Client — public event page & registration form

## Description

Build the public-facing React components for the private event registration flow. These pages are accessed via the shareable registration link containing the registration token.

**Components & pages:**

1. **`EventPage`** (`client/src/pages/EventPage.tsx`) — Route: `/events/:requestId`. Reads `token` from URL query parameter. Calls `GET /api/events/:requestId?token=...` to fetch event info. Displays:
   - Class name and description (from content.json data in the API response)
   - Location
   - Proposed dates with current vote tallies (number of kids registered per date)
   - Registration form (below the info section)
   - Confirmation message after successful registration

2. **`RegistrationForm`** component (`client/src/components/RegistrationForm.tsx`) — Form fields:
   - `attendeeName` — text input, required
   - `attendeeEmail` — email input, required
   - `numberOfKids` — number input, required, min 1
   - Date checkboxes — one checkbox per proposed date, at least one must be selected
   - Submit button
   - Calls `POST /api/events/:requestId/register` with `{ token, attendeeName, attendeeEmail, numberOfKids, availableDates }`
   - Shows success message on 201, error messages for 401/409/422

3. **React Router integration** — Add the `/events/:requestId` route to the client router. This is a public route (no authentication required).

**UX notes:**
- Date checkboxes should display proposed dates in a readable format (e.g., "Saturday, May 15, 2026")
- Vote tallies shown as "X kids registered" per date
- After successful registration, replace the form with a confirmation: "You're registered! We'll let you know when the date is finalized."
- Error states: invalid/expired token shows "This registration link is invalid"; request not in `dates_proposed` shows "Registration is not currently open for this event"

## Acceptance Criteria

- [x] `/events/:requestId?token=...` route exists in client router
- [x] Event info page displays class name, description, location, proposed dates with vote tallies
- [x] Registration form collects name, email, number of kids, and date preferences
- [x] Date checkboxes match the proposed dates from the API
- [x] At least one date must be selected before submit
- [x] Successful registration shows confirmation message
- [x] Duplicate email (409) shows "You've already registered for this event"
- [x] Invalid token (401) shows descriptive error
- [x] Registration closed (422) shows descriptive error
- [x] Form validates required fields client-side before submission

## Testing

- **Existing tests to run**: `npm run test:client`
- **New tests to write**: `tests/client/EventRegistration.test.tsx` — renders event info, form validation, successful submission, error handling (401, 409, 422), date checkbox interaction
- **Verification command**: `npm run test:client`
