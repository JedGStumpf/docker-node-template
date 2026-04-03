---
id: "005"
title: "Pike13 write-back — bookInstructor on confirmation"
status: todo
use-cases: [SUC-004]
depends-on: []
github-issue: ""
todo: "pike13-write-back.md"
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Pike13 write-back — bookInstructor on confirmation

## Description

Extend `IPike13Client` with a write method to book the assigned instructor in Pike13 when an event is confirmed (spec §3.5, §4.1). The booking makes the event appear on the instructor's Pike13 calendar.

**IPike13Client extension:**
- `bookInstructor(pike13UserId: string, date: Date, classSlug: string): Promise<{ appointmentId: string } | null>`

**MockPike13Client:** Returns a fake appointment ID.
**RealPike13Client:** Calls Pike13 API to create an appointment/booking. Requires write scope (may need `write:appointments` or similar — verify against Pike13 API docs).

**Behavior:**
- Called during `confirmed` transition when `assignedInstructorId` is set.
- Idempotent: if the booking already exists (re-confirmation), don't create a duplicate. Use `classSlug + date + pike13UserId` as a natural dedup key.
- Best-effort: if Pike13 API fails, log the error and notify admin. Confirmation proceeds.

## Acceptance Criteria

- [ ] `IPike13Client.bookInstructor()` method added to interface
- [ ] `MockPike13Client` implements the method returning a fake ID
- [ ] `RealPike13Client` implements the method calling Pike13 API
- [ ] Booking is idempotent (no duplicate bookings on re-confirmation)
- [ ] API failure is logged, does not block confirmation
- [ ] If no instructor is assigned, booking is skipped

## Testing

- **Existing tests to run**: `npm run test:server` — ensure existing Pike13 tests still pass
- **New tests to write**: `tests/server/pike13-writeback.test.ts` — mock client called with correct params on confirmation, failure doesn't throw, no call when no instructor assigned, idempotent behavior
- **Verification command**: `npm run test:server`
