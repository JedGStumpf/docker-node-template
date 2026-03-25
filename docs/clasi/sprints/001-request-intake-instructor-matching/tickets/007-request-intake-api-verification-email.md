---
id: "007"
title: "Request intake API & verification email"
status: todo
use-cases:
  - SUC-001
  - SUC-002
  - SUC-003
depends-on:
  - "001"
  - "004"
  - "005"
github-issue: ""
todo: ""
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Request intake API & verification email

## Description

Implement `RequestService.createRequest` and the `POST /api/requests` route. On submission, the system validates the class slug (must be requestable), validates the requester's zip has coverage, saves the request in `unverified` status with a time-limited verification token, and dispatches a verification email. Also implements `GET /api/requests/:id` for status polling.

This ticket also wires up `EmailService` with its injectable transport interface. The in-memory mock transport is used in all tests.

## Acceptance Criteria

- [ ] `POST /api/requests` with all required fields and a valid, covered zip returns 201 + `{ id, status: "unverified" }`
- [ ] `POST /api/requests` with an unrecognized or non-requestable `classSlug` returns 422
- [ ] `POST /api/requests` with a zip that has no matching instructors returns 422 with a `no_coverage` error code
- [ ] `POST /api/requests` with missing required fields returns 422 with field-level validation errors
- [ ] A verification email is dispatched (captured by in-memory mock) containing a link with `requestId` and `verificationToken`
- [ ] `verificationExpiresAt` is set to `createdAt + VERIFICATION_EXPIRY_MS` (default 1 hour)
- [ ] `GET /api/requests/:id` returns 200 + request JSON for any valid ID (status visible to anyone with the obscure URL)
- [ ] `GET /api/requests/:id` returns 404 for an unknown ID
- [ ] `EmailService` uses an injectable Nodemailer transport; in tests the mock transport captures sent messages for assertion

## Testing

- **Existing tests to run**: `npm run test:server`
- **New tests to write**: `tests/server/request-intake.test.ts` — happy-path POST (verify email captured, status unverified), bad classSlug, no-coverage zip, missing fields, GET by ID, GET 404.
- **Verification command**: `npm run test:server`

## Implementation Notes

- `POST /api/requests` does not require authentication (requesters have no accounts).
- Required fields: `classSlug`, `requesterName`, `requesterEmail`, `groupType`, `zipCode`, `expectedHeadcount`, `preferredDates` (non-empty array). Optional: `locationFreeText`, `externalRegistrationUrl`, `siteControl`, `siteReadiness`, `marketingCapability`.
- `verificationToken`: use `crypto.randomUUID()`.
- Email transport: define a `IEmailTransport` interface with `send(message)`. Production uses `nodemailer-ses-transport`; tests use an `InMemoryTransport` that pushes to an array.
- Inject `EmailService` and the transport via `ServiceRegistry`.
- Route file: `server/src/routes/requests.ts`.
