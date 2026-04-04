---
id: "004"
title: "Requester status page — tokenized status view"
status: todo
use-cases: []
depends-on: []
github-issue: ""
todo: ""
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Requester status page — tokenized status view

## Description

After a request is verified, redirect the requester to `/requests/:id?token=:registrationToken` which shows their request status. No login required — access is gated by the `registrationToken` stored on the request record.

### Server changes

Add `GET /api/requests/:id/status?token=` in `server/src/routes/requests.ts` (or a new route file):
- Validates that `token` query param matches `request.registrationToken`
- Returns 404 if token is invalid or missing
- Returns: `{ id, status, classSlug, classTitle, confirmedDate, registrationCount, eventPageUrl }`

Update the verification endpoint (in `server/src/routes/auth.ts` or `requests.ts`): when verify succeeds, redirect to `/requests/:id?token=:registrationToken` instead of a static holding page.

### Client changes

New page `client/src/pages/RequesterStatus.tsx` at route `/requests/:id`:
- Reads `id` from URL params and `token` from query string
- Fetches `GET /api/requests/:id/status?token=`
- Shows request status with a human-readable label (e.g. "We're finding an instructor for your event")
- Shows confirmed date if status is confirmed or completed
- Shows registration count if event page exists
- Shows link to `/events/:id` once confirmed
- Shows "Check back later" message for early statuses (pending, verified)

Register the new route in `client/src/App.tsx`.

## Acceptance Criteria

- [ ] `GET /api/requests/:id/status?token=` returns request status for a valid token
- [ ] `GET /api/requests/:id/status?token=` returns 404 for an invalid or missing token
- [ ] Page renders at `/requests/:id?token=` with correct status info (no login required)
- [ ] Verification success redirects to the status page (not a static page)
- [ ] `npm run test:server` passes (happy-path + 404 token tests)
- [ ] `npm run test:client` passes (renders status labels correctly)

## Testing

- **Existing tests to run**: `npm run test:server && npm run test:client`
- **New tests to write**:
  - Server: `tests/server/requester-status.test.ts` — valid token returns 200 with fields; invalid token returns 404
  - Client: `tests/client/RequesterStatus.test.tsx` — renders status label, confirmed date, event link based on mock API response
- **Verification command**: `npm run test:server && npm run test:client`
