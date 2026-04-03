---
id: "004"
title: "GoogleCalendarService — calendar event creation with graceful degradation"
status: todo
use-cases: [SUC-003]
depends-on: [001]
github-issue: ""
todo: "google-calendar-integration.md"
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# GoogleCalendarService — calendar event creation with graceful degradation

## Description

Create `GoogleCalendarService` to add confirmed events to the League's shared internal Google Calendar (spec §3.3 step 10, §3.4 step 7). Uses Google Calendar API with service account auth.

**IGoogleCalendarClient interface:**
- `createEvent(params: { calendarId, summary, date, location, description })` → `{ eventId }`
- `deleteEvent(calendarId: string, eventId: string)` → void

**MockGoogleCalendarClient:** Returns fake event IDs.
**RealGoogleCalendarClient:** Uses `googleapis` package with service account. Calendar ID from `GOOGLE_CALENDAR_ID` env var. Auth from `GOOGLE_SERVICE_ACCOUNT_KEY` env var (JSON string).

**GoogleCalendarService methods:**
- `createCalendarEvent(request: EventRequest)` — creates an all-day event (per architecture decision — spec doesn't define times). Summary: class title. Location: from request. Description: requester name, expected headcount, assigned instructor name. Returns `eventId` or null if credentials missing.
- Graceful degradation: if `GOOGLE_CALENDAR_ID` not configured, logs warning and returns null (no error thrown, doesn't block confirmation).

**ServiceRegistry:** Add `googleCalendar: GoogleCalendarService` with mock/real client injection.

## Acceptance Criteria

- [ ] `IGoogleCalendarClient` interface with `createEvent()` and `deleteEvent()`
- [ ] `MockGoogleCalendarClient` returns fake event IDs
- [ ] `RealGoogleCalendarClient` uses `googleapis` with service account
- [ ] `createCalendarEvent()` creates an all-day event with class title, location, description
- [ ] Returns null when `GOOGLE_CALENDAR_ID` is not set (graceful degradation)
- [ ] `googleCalendar` registered on `ServiceRegistry`
- [ ] `googleapis` added to server package.json

## Testing

- **Existing tests to run**: `npm run test:server`
- **New tests to write**: `tests/server/google-calendar.test.ts` — event created with correct fields, graceful degradation when credentials missing (returns null, no error), mock client captures params
- **Verification command**: `npm run test:server`
