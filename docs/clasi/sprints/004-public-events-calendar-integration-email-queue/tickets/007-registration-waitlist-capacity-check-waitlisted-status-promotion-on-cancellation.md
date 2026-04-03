---
id: "007"
title: "Registration waitlist — capacity check, waitlisted status, promotion on cancellation"
status: todo
use-cases: [SUC-005, SUC-006, SUC-009]
depends-on: [001, 002]
github-issue: ""
todo: "waitlist-when-registration-full.md"
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Registration waitlist — capacity check, waitlisted status, promotion on cancellation

## Description

Extend `RegistrationService` with waitlist logic (FEAT-1 §3.1). When a confirmed event is at capacity, new registrations go to `waitlisted` status. When a confirmed registrant cancels, the oldest waitlisted person is promoted.

**RegistrationService changes:**

`createRegistration()` — after validation, check capacity: if event is `confirmed` and `eventCapacity` is set and total confirmed kids ≥ `eventCapacity`, create with `status: waitlisted`. If `eventCapacity` is null, no cap.

New method: `cancelRegistration(registrationId: string)` — set registration to `cancelled`. If the event is confirmed and has spare capacity (or the cancellation freed a slot), call `promoteFromWaitlist()`.

New method: `promoteFromWaitlist(requestId: string)` — find the oldest `waitlisted` registration (by `createdAt`). Change status to `confirmed`. Send iCal invite via `EmailService.sendEventConfirmation()`. Send notification to the promoted attendee.

**New API route:** `POST /api/events/:requestId/registrations/:id/cancel` — public endpoint, requires registration token. Calls `cancelRegistration()`.

## Acceptance Criteria

- [ ] Registration at capacity creates `waitlisted` record (not 422)
- [ ] Waitlisted registrations don't count toward capacity
- [ ] When `eventCapacity` is null, no cap is enforced
- [ ] `cancelRegistration()` sets status to `cancelled`
- [ ] Cancellation of a confirmed registration triggers promotion of oldest waitlisted
- [ ] Promoted registrant receives iCal invite email
- [ ] If no waitlisted registrations exist, no promotion occurs
- [ ] `POST /api/events/:requestId/registrations/:id/cancel` works with valid token
- [ ] Admin can also cancel a registration via admin route

## Testing

- **Existing tests to run**: `npm run test:server` — existing registration tests must pass
- **New tests to write**: `tests/server/waitlist.test.ts` — registration at capacity creates waitlisted, cancellation promotes next, promotion sends iCal, no promotion when empty waitlist, null eventCapacity means unlimited
- **Verification command**: `npm run test:server`
