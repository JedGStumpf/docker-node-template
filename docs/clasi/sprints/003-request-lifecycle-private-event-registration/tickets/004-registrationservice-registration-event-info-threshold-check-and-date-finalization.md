---
id: "004"
title: "RegistrationService — registration, event info, threshold check, and date finalization"
status: todo
use-cases: [SUC-003, SUC-004]
depends-on: [002, 003]
github-issue: ""
todo: ""
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# RegistrationService — registration, event info, threshold check, and date finalization

## Description

Create `RegistrationService` and register it on `ServiceRegistry`. This service manages the `Registration` model, date vote tallies, headcount threshold checks, and date finalization (auto + manual).

**Methods:**

1. `createRegistration(requestId, data, token)` — Validates the registration token matches the request's `registrationToken`. Verifies request is in `dates_proposed` status. Validates `availableDates` is a non-empty subset of the request's `proposedDates`. Creates a `Registration` record with `status: interested`. Enforces unique `(requestId, attendeeEmail)` — returns 409 on duplicate. After creation, calls `checkAndFinalizeThreshold()` inside a transaction.

2. `getEventInfo(requestId, token)` — Validates token. Returns public event info: class name (from `classSlug` → content.json lookup), proposed dates, location, current vote tallies per date (sum of `numberOfKids` grouped by date).

3. `listRegistrations(requestId)` — Admin/instructor only. Returns all registrations with aggregated vote tallies per date.

4. `checkAndFinalizeThreshold(requestId)` — Called within `prisma.$transaction()`. Locks the `EventRequest` row (`FOR UPDATE` on Postgres, single-writer on SQLite). Sums `numberOfKids` per proposed date. If any date meets `minHeadcount`, calls `finalizeDate()` for the winning date. **Tie-breaking:** highest kid count, then earliest date.

5. `finalizeDate(requestId, date)` — Must run inside a transaction. Guards on `status === 'dates_proposed'` (idempotent if already confirmed). Sets `confirmedDate`, calls `RequestService.transitionStatus(requestId, 'confirmed')`. Updates registrant statuses: `confirmed` for those whose `availableDates` includes the winning date, `declined` for others. After transaction commit: sends iCal to confirmed registrants, date-change notification to declined registrants, confirmation notification to admin/requester/instructor/site-rep.

6. `generateDigest(requestId)` — Produces an HTML summary: registrant names, kid counts per proposed date, and totals. Used by the digest scheduled job.

**ServiceRegistry:** Add `registration` property, instantiate as `new RegistrationService(this.prisma)`.

## Acceptance Criteria

- [ ] `RegistrationService` class created at `server/src/services/registration.service.ts`
- [ ] `ServiceRegistry` has a `registration` property returning a `RegistrationService` instance
- [ ] `createRegistration()` validates token, status, availableDates subset, and unique email
- [ ] Invalid/missing token returns 401; wrong status returns 422; duplicate email returns 409
- [ ] `checkAndFinalizeThreshold()` runs inside a transaction with row-level locking
- [ ] When a date crosses `minHeadcount`, auto-finalization triggers and request transitions to `confirmed`
- [ ] Tie-breaking: highest kid count wins; earliest date breaks ties
- [ ] `finalizeDate()` is idempotent — returns early if already `confirmed`
- [ ] Registrants who voted for the winning date get `status: confirmed`
- [ ] Registrants who did not vote for the winning date get `status: declined`
- [ ] iCal emails sent to confirmed registrants after transaction commit
- [ ] Date-change notifications sent to declined registrants after transaction commit
- [ ] `generateDigest()` produces correct HTML summary with per-date kid counts

## Testing

- **Existing tests to run**: `npm run test:server` (all tests)
- **New tests to write**: `tests/server/private-registration.test.ts` — registration creation, token validation, duplicate email 409, status validation 422, availableDates subset validation; `tests/server/date-finalization.test.ts` — threshold crossing triggers finalization, multi-date tiebreaker, manual finalization, idempotent re-finalization, deadline expiry notification
- **Verification command**: `npm run test:server`
