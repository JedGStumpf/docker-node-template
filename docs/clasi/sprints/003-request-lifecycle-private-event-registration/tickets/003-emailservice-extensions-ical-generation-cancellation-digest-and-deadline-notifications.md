---
id: '003'
title: "EmailService extensions \u2014 iCal generation, cancellation, digest, and\
  \ deadline notifications"
status: in-progress
use-cases:
- SUC-002
- SUC-006
- SUC-007
- SUC-009
depends-on:
- 2
github-issue: ''
todo: ''
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# EmailService extensions — iCal generation, cancellation, digest, and deadline notifications

## Description

Install the `ical-generator` npm package and extend `EmailService` with five new methods for the event lifecycle. Wire cancellation emails into the status transition side effects from ticket 002.

**New methods:**

1. `sendEventConfirmation(to, eventDetails, icsBuffer)` — Sends an email with an `.ics` attachment (VEVENT) to confirmed registrants. The iCal contains: event title (class name), date/time (`confirmedDate`), location (`locationFreeText`), organizer (admin email). Reply-To set to `emailThreadAddress` if available.

2. `sendDateChangeNotification(to, eventDetails, confirmedDate)` — Notifies registrants who voted for a different date that the event is happening on a date they didn't select. Includes the confirmed date and event details.

3. `sendCancellationNotification(to, eventDetails)` — Notifies a participant (requester, instructor, site rep, registrant) that an event was cancelled. Sent as a side effect of any transition to `cancelled`.

4. `sendDeadlineExpiredNotification(to, eventDetails)` — Notifies requester and admin that the voting deadline passed without any date reaching the minimum headcount. Event requires admin action (cancel or reschedule).

5. `sendRegistrationDigest(replyTo, threadAddress, digestHtml)` — Sends a registration summary to the event email thread address. Contains registrant names, kid counts per proposed date, and totals.

**iCal generation helper:** Add a private method `generateIcsBuffer(eventDetails)` that uses `ical-generator` to produce a `Buffer` containing a valid `.ics` file with a single VEVENT.

**Wiring:** Update `RequestService.transitionStatus()` to call `sendCancellationNotification()` for all transitions to `cancelled`. Emails sent after the database transaction commits (not inside transaction).

## Acceptance Criteria

- [ ] `ical-generator` installed as a production dependency in `server/package.json`
- [ ] `sendEventConfirmation()` generates and attaches a valid `.ics` file with correct VEVENT fields
- [ ] `.ics` attachment has correct MIME type (`text/calendar`)
- [ ] `sendDateChangeNotification()` sends notification with confirmed date to non-matching registrants
- [ ] `sendCancellationNotification()` sends to requester, assigned instructor, site rep, and registrants as applicable
- [ ] `sendDeadlineExpiredNotification()` sends to requester and admin
- [ ] `sendRegistrationDigest()` sends to the event's email thread address
- [ ] Email `Reply-To` set to `emailThreadAddress` where specified
- [ ] Cancellation emails wired into `transitionStatus()` for all `→ cancelled` transitions
- [ ] Emails sent after transaction commit, not inside transaction

## Testing

- **Existing tests to run**: `tests/server/email-thread.test.ts`, `tests/server/request-lifecycle.test.ts` (from ticket 002)
- **New tests to write**: `tests/server/ical-delivery.test.ts` — iCal attachment has valid VEVENT data, only confirmed registrants receive invite, Reply-To set correctly; cancellation notification tests within `request-lifecycle.test.ts`
- **Verification command**: `npm run test:server`
