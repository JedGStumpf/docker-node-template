---
id: "006"
title: "RequestService confirmed transition — Meetup, Google Calendar, Pike13 side effects"
status: todo
use-cases: [SUC-001, SUC-003, SUC-004]
depends-on: [003, 004, 005]
github-issue: ""
todo: ""
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# RequestService confirmed transition — Meetup, Google Calendar, Pike13 side effects

## Description

Wire the three new services into `RequestService.transitionStatus()` so that the `confirmed` transition triggers Meetup event creation (public events), Google Calendar event creation (all events), and Pike13 instructor booking (when instructor assigned).

**RequestService constructor change:** Accept an options object:
```typescript
constructor(prisma: any, opts?: {
  meetupService?: MeetupService;
  googleCalendarService?: GoogleCalendarService;
  pike13Client?: IPike13Client;
})
```

**`confirmed` transition side effects (after existing side effects):**
1. If `eventType === 'public'` and `meetupService` is available: call `meetupService.createMeetupEvent(request)`. Store `meetupEventId` and `meetupEventUrl` on the request.
2. If `googleCalendarService` available: call `googleCalendarService.createCalendarEvent(request)`. Store `googleCalendarEventId`.
3. If `assignedInstructorId` is set and `pike13Client` available: look up instructor's `pike13UserId`, call `pike13Client.bookInstructor()`.

All three are best-effort — catch errors, log, continue. Services are optional (null/undefined → skip).

**ServiceRegistry update:** Pass the new services to `RequestService` constructor.

## Acceptance Criteria

- [ ] `RequestService` constructor accepts optional `MeetupService`, `GoogleCalendarService`, `IPike13Client`
- [ ] `confirmed` transition calls `createMeetupEvent()` for public events
- [ ] `confirmed` transition calls `createCalendarEvent()` for all events
- [ ] `confirmed` transition calls `bookInstructor()` when instructor assigned
- [ ] Each side effect is best-effort (failure logged, doesn't block)
- [ ] When a service is not injected, its side effect is silently skipped
- [ ] `ServiceRegistry` wires the new services into `RequestService`
- [ ] Existing transition tests still pass

## Testing

- **Existing tests to run**: `npm run test:server` — all request lifecycle tests must pass
- **New tests to write**: `tests/server/confirmed-side-effects.test.ts` (or extend `request-lifecycle.test.ts`) — public event creates Meetup event, all events create calendar event, instructor is booked, failures don't block, private events skip Meetup
- **Verification command**: `npm run test:server`
