---
ticket: "004"
sprint: "006"
status: in-progress
---

# Ticket 004 Plan: Requester status page — tokenized status view

## Approach

### Server

1. Add `GET /api/requests/:id/status?token=` in `server/src/routes/requests.ts`:
   - Find request by id → 404 if not found
   - Compare token query param to `request.registrationToken` → 404 if mismatch or missing
   - Fetch registration count via `prisma.registration.count`
   - Return safe DTO: `{ id, status, classSlug, classTitle, confirmedDate, registrationCount, publicEventUrl }`
   - Register WITHOUT auth middleware — the route is already in `requestsRouter` which is public
   - Must be declared BEFORE `GET /requests/:id` to avoid route shadowing (use `/requests/:id/status` path which doesn't conflict since the static segment "status" won't match the `:id` pattern... actually it would — declare specifically)

   NOTE: The path `/requests/:id/status` with param `:id` — Express will match
   `/requests/some-uuid/status` correctly. Must be registered before the generic
   `/requests/:id` GET handler.

2. Update `POST /api/requests/:id/verify`: redirect (302) to `/requests/${id}?token=${registrationToken}`.
   If registrationToken is null (old records that were verified before sprint 006), fall back to JSON response.

### Client

1. New `client/src/pages/RequesterStatus.tsx`:
   - Reads `id` from `useParams()`, `token` from `useSearchParams()`
   - Fetches `GET /api/requests/:id/status?token=` on mount
   - Shows: status label, confirmed date if set, registration count, link to `/events/:id` when confirmed
   - Shows "Check back later" for early statuses (unverified, new, discussing)

2. Register route in `client/src/App.tsx` OUTSIDE AppLayout — same pattern as `/events/:requestId`.

## Files to Create/Modify

- `server/src/routes/requests.ts` — add status endpoint, update verify redirect
- `client/src/pages/RequesterStatus.tsx` — new page component
- `client/src/App.tsx` — add route outside AppLayout
- `tests/server/requester-status.test.ts` — new server test
- `tests/client/RequesterStatus.test.tsx` — new client test

## Testing Plan

- Server: `tests/server/requester-status.test.ts` — valid token 200, missing token 404, wrong token 404
- Client: `tests/client/RequesterStatus.test.tsx` — renders status labels for different statuses
- Verification: `npm run test:server && npm run test:client`

## Documentation Updates

- None required.
