---
sprint: "002"
status: approved
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Sprint 002 Use Cases

## SUC-001: Admin Sends Site Registration Invitation

- **Actor**: Admin (Pike13 admin role)
- **Preconditions**: Admin is authenticated. A venue contact's email is known.
- **Main Flow**:
  1. Admin calls `POST /api/admin/sites/invite` with `{ name, contactEmail, contactName }`.
  2. System creates a `SiteInvitation` record (token, 7-day expiry, `used: false`).
  3. System sends an invitation email to `contactEmail` with a registration link containing the token.
  4. Admin receives 201 with the invitation record (no token in response).
- **Postconditions**: `SiteInvitation` record exists; invitation email sent.
- **Acceptance Criteria**:
  - [ ] `POST /api/admin/sites/invite` returns 201 when called by an admin
  - [ ] Returns 401 for unauthenticated requests, 403 for non-admin
  - [ ] Invitation email is dispatched (captured by email mock in tests)
  - [ ] `SiteInvitation.expiresAt` is approximately 7 days from creation

---

## SUC-002: Site Rep Registers via Tokenized Invitation Link

- **Actor**: Site Representative (venue contact)
- **Preconditions**: A valid, unused, unexpired `SiteInvitation` exists with matching token.
- **Main Flow**:
  1. Site rep opens registration link; client calls `GET /api/site-reg/:token` to prefill the form.
  2. System validates token (exists, unused, not expired) and returns invitation data.
  3. Site rep fills in venue details: address, capacity, room notes, and their display name.
  4. Site rep submits → `POST /api/site-reg/:token`.
  5. System creates `RegisteredSite` record (geocodes ZIP to lat/lng).
  6. System creates `SiteRep` record linked to the site, pre-filled with `contactEmail` from invitation.
  7. System marks `SiteInvitation.used = true`.
  8. System sends site rep a magic-link email so they can set up their session.
  9. Response: 201 with `RegisteredSite` data.
- **Postconditions**: `RegisteredSite` and `SiteRep` created; invitation marked used; magic-link sent.
- **Acceptance Criteria**:
  - [ ] `GET /api/site-reg/:token` returns 200 with pre-fill data for valid token
  - [ ] Returns 404 for unknown token, 410 for expired or already-used token
  - [ ] `POST /api/site-reg/:token` creates `RegisteredSite` and `SiteRep` records and returns 201
  - [ ] Invitation is marked `used = true` after successful registration
  - [ ] Re-use of the same token returns 410

---

## SUC-003: Site Rep Authenticates via Magic Link

- **Actor**: Site Representative
- **Preconditions**: A `SiteRep` record exists for the email.
- **Main Flow**:
  1. Site rep calls `POST /api/auth/magic-link/request` with `{ email }`.
  2. System looks up `SiteRep` by email. If found, creates a hashed `SiteRepSession` token (15 min TTL) and sends magic-link email.
  3. Site rep clicks link; client calls `POST /api/auth/magic-link/verify` with `{ token }`.
  4. System validates token (exists, not used, not expired), marks it used, creates a session with `role: SITE_REP` and `siteRepId`.
  5. Response 200; site rep is now authenticated.
- **Alternate Flow — Unknown email**: If no `SiteRep` found in step 2, system returns 200 (to prevent email enumeration) but sends no email.
- **Postconditions**: Site rep has an authenticated session.
- **Acceptance Criteria**:
  - [ ] `POST /api/auth/magic-link/request` returns 200 for known and unknown emails
  - [ ] Magic-link email dispatched only when `SiteRep` exists (captured by mock)
  - [ ] `POST /api/auth/magic-link/verify` with valid token creates session and returns 200
  - [ ] Returns 410 for expired or already-used token
  - [ ] Token is single-use (second verify call returns 410)

---

## SUC-004: Requester Selects a Registered Site on Intake Form

- **Actor**: Requester
- **Preconditions**: At least one active `RegisteredSite` exists.
- **Main Flow**:
  1. Intake form calls `GET /api/sites` to populate the site picker autocomplete.
  2. Requester selects a registered site from the list.
  3. Requester completes and submits the intake form.
  4. `POST /api/requests` payload includes `registeredSiteId`.
  5. System stores `EventRequest.registeredSiteId`; all other intake flow steps proceed as per SUC-001 (Sprint 1).
- **Alternate Flow — Free-text fallback**: Requester types a location string; `registeredSiteId` is omitted; request is saved with `location` text field only.
- **Postconditions**: `EventRequest.registeredSiteId` is set (or null for free-text).
- **Acceptance Criteria**:
  - [ ] `GET /api/sites` returns active registered sites (public, no auth)
  - [ ] `POST /api/requests` with `registeredSiteId` stores the FK and returns 201
  - [ ] `POST /api/requests` with an unrecognised `registeredSiteId` returns 422
  - [ ] `POST /api/requests` with no `registeredSiteId` continues to work (free-text)

---

## SUC-005: Per-Request Email Thread Address Provisioned on Verification

- **Actor**: Background (triggered during `RequestService.verifyRequest`)
- **Preconditions**: `EventRequest` in `unverified` status; verification token valid; `THREAD_DOMAIN` env var set.
- **Main Flow**:
  1. `POST /api/requests/:id/verify` fires verification logic.
  2. System generates `emailThreadAddress = req-{ulid}@threads.{THREAD_DOMAIN}`.
  3. `emailThreadAddress` stored on `EventRequest`.
  4. All outbound notification emails for this request (admin alert, instructor match, site rep) include `Reply-To: emailThreadAddress`.
- **Postconditions**: `EventRequest.emailThreadAddress` is set; all outbound notification emails use it as Reply-To.
- **Acceptance Criteria**:
  - [ ] After verification, `EventRequest.emailThreadAddress` is non-null and matches `req-{...}@threads.{domain}` pattern
  - [ ] Admin notification email mock captures `Reply-To` header equal to `emailThreadAddress`
  - [ ] Instructor match notification email mock captures correct `Reply-To`
  - [ ] If `THREAD_DOMAIN` is not set, verification proceeds without setting thread address (logs warning)

---

## SUC-006: Site Rep Automatically Notified When Request Goes to New

- **Actor**: `RequestService` (triggered on `unverified` → `new` transition)
- **Preconditions**: `EventRequest.registeredSiteId` is set; `RegisteredSite` has an associated `SiteRep`.
- **Main Flow**:
  1. Request verification succeeds → status moves to `new`.
  2. System looks up the `RegisteredSite` and its `SiteRep`.
  3. System sends a site rep notification email: includes requester name, class, expected headcount, preferred dates, and `Reply-To: emailThreadAddress`.
- **Alternate Flow — No site rep registered**: If site has no `SiteRep` or `registeredSiteId` is null, no site rep email is sent.
- **Postconditions**: Site rep notified; email is on the shared coordination thread.
- **Acceptance Criteria**:
  - [ ] Site rep notification email dispatched when `registeredSiteId` is set and a `SiteRep` exists (mock captures)
  - [ ] Email includes `Reply-To` equal to `eventRequest.emailThreadAddress`
  - [ ] No site rep email sent when `registeredSiteId` is null

---

## SUC-007: Asana Task Created When Request Is Verified

- **Actor**: `RequestService` (triggered on `unverified` → `new` transition)
- **Preconditions**: `ASANA_ACCESS_TOKEN` and `ASANA_PROJECT_GID` are configured.
- **Main Flow**:
  1. Request verification succeeds → request transitions to `new`.
  2. `AsanaService.createRequestTask(request)` creates a task in the configured Asana project.
  3. Task name: `[Event Request] {classSlug} — {requesterName}`.
  4. Task notes include: ZIP, group type, headcount, preferred dates, thread email, request URL.
  5. `EventRequest.asanaTaskId` is set to the returned Asana task GID.
- **Alternate Flow — Asana not configured**: If env vars absent, `AsanaService` logs a warning and returns without error; verification still succeeds.
- **Alternate Flow — Asana API error**: If the Asana call fails, log the error; do not block verification; `asanaTaskId` remains null.
- **Postconditions**: Asana task created (when configured); `EventRequest.asanaTaskId` set.
- **Acceptance Criteria**:
  - [ ] After verification, `EventRequest.asanaTaskId` is set when mock Asana client is configured
  - [ ] Mock `IAsanaClient.createTask` is called with correct task name and notes
  - [ ] Verification succeeds and request reaches `new` even when Asana is unconfigured or erroring
  - [ ] `asanaTaskId` is null when Asana is unconfigured

---

## SUC-008: Admin Views and Manages All Requests via Expanded Dashboard

- **Actor**: Admin (Pike13 admin role)
- **Preconditions**: Admin is authenticated.
- **Main Flow**:
  1. Admin calls `GET /api/admin/requests` with optional query params `status`, `search`, `page`, `limit`.
  2. System returns paginated results matching filters.
  3. Admin calls `GET /api/admin/requests/:id` to view full request detail.
  4. Detail includes: requester info, class, status, site (if registered), assigned instructor, Asana task URL, email thread address, all assignments with status.
  5. Admin calls `PUT /api/admin/requests/:id/status` to override status (e.g. `cancelled`, `discussing`).
- **Postconditions**: Admin can monitor and intervene in any request.
- **Acceptance Criteria**:
  - [ ] `GET /api/admin/requests?status=new` returns only new requests
  - [ ] `GET /api/admin/requests?search=alice` returns requests matching requester name or email
  - [ ] `GET /api/admin/requests?page=2&limit=10` returns paginated results with `total` and `pages` metadata
  - [ ] `GET /api/admin/requests/:id` returns full detail including site, assignments, `asanaTaskId`, `emailThreadAddress`
  - [ ] `PUT /api/admin/requests/:id/status` updates status and returns 200
  - [ ] All endpoints return 401 without auth, 403 for non-admin
