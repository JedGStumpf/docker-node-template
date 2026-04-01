---
id: "004"
title: "RequestService extensions — email thread address, Asana task, site rep notification"
status: done
use-cases: [SUC-004, SUC-005, SUC-006]
depends-on: ["001", "002", "003"]
github-issue: ""
todo: ""
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# RequestService extensions — email thread address, Asana task, site rep notification

## Description

Extend `RequestService.verifyRequest` (the method that transitions an `EventRequest` from `unverified` → `new`) with three new behaviours. All are additive — existing logic is unchanged.

1. **Email thread address** — Generate `req-{ulid}@threads.{THREAD_DOMAIN}` and store on `request.emailThreadAddress`. Skip (no-op) when `THREAD_DOMAIN` env var is not set. Install `ulid` npm package in `server/` if not already present.

2. **Asana task creation** — Call `services.asana.createRequestTask(request)`. If it returns a GID, store on `request.asanaTaskId`. If it returns null or throws, log a warning and continue (do not fail the verification).

3. **Site rep notification** — If `request.registeredSiteId` is set, look up the `SiteRep` for that site and call `EmailService.sendSiteRepNotification(siteRep, request, request.emailThreadAddress)`.

Update `POST /api/requests` to accept and persist an optional `registeredSiteId` field.

Existing notification emails (`sendAdminNewRequestNotification`, `sendMatchNotification`) should now include `replyTo: request.emailThreadAddress` when the address is set on the request.

## Acceptance Criteria

- [ ] `verifyRequest` generates and stores `emailThreadAddress` when `THREAD_DOMAIN` is set
- [ ] `verifyRequest` calls `AsanaService.createRequestTask` and stores the returned GID
- [ ] Asana failure (null or thrown) does not prevent verification from completing
- [ ] `verifyRequest` sends site rep notification when `registeredSiteId` is set
- [ ] Admin and match notification emails include `Reply-To` header when thread address is present
- [ ] `POST /api/requests` accepts optional `registeredSiteId` and persists it
- [ ] All existing request/verification tests still pass

## Testing

- **Existing tests to run**: `npm run test:server` (especially `auth.test.ts`, `matching.test.ts`, `admin-requests.test.ts`)
- **New tests to write**: `tests/server/email-thread.test.ts` — verify thread address is generated on verification, reply-to header is set on outgoing emails, site rep notification is sent when site is linked
- **Verification command**: `npm run test:server`
