---
id: "003"
title: "MeetupService — client interface, event creation, RSVP sync"
status: todo
use-cases: [SUC-001, SUC-002]
depends-on: [001]
github-issue: ""
todo: ""
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# MeetupService — client interface, event creation, RSVP sync

## Description

Create `MeetupService` with an injectable `IMeetupClient` interface following the established pattern (spec §3.4, §4.1). The service creates Meetup events for confirmed public events and syncs RSVP counts.

**IMeetupClient interface:**
- `createEvent(params: { title, description, date, location, groupUrlname })` → `{ eventId, eventUrl }`
- `getRsvps(eventId: string)` → `{ count: number }`
- `updateEvent(eventId: string, params)` → void

**MockMeetupClient:** Returns fake IDs/URLs for tests.
**RealMeetupClient:** Calls Meetup GraphQL API using `fetch()`. Auth via `MEETUP_API_KEY` env var.

**MeetupService methods:**
- `createMeetupEvent(request: EventRequest)` — builds event description from `ContentService.getClassBySlug()`. Maps `classSlug` to Meetup group via `ContentService.getGroupsJson()` (spec §4.5). Fallback: use `MEETUP_GROUP_URLNAME` env var. If `externalRegistrationUrl` is set, place prominent "Host Registration" link at top of description (spec §3.4 step 2). Returns `{ meetupEventId, meetupEventUrl }`.
- `syncRsvps(requestId: string)` — pull RSVP count, update `EventRequest.meetupRsvpCount`.

**ServiceRegistry:** Add `meetup: MeetupService` with mock/real client injection.

## Acceptance Criteria

- [ ] `IMeetupClient` interface defined with `createEvent()`, `getRsvps()`, `updateEvent()`
- [ ] `MockMeetupClient` returns fake data; `RealMeetupClient` calls Meetup API
- [ ] `createMeetupEvent()` builds description with class details from content.json
- [ ] External registration URL is placed prominently at top of Meetup description when present
- [ ] `syncRsvps()` updates `meetupRsvpCount` on `EventRequest`
- [ ] Graceful degradation: if `MEETUP_API_KEY` is missing, returns 501 with setup instructions
- [ ] `MeetupService` registered on `ServiceRegistry`

## Testing

- **Existing tests to run**: `npm run test:server`
- **New tests to write**: `tests/server/meetup-integration.test.ts` — event creation with/without external registration URL, RSVP sync updates count, mock client returns expected data, missing API key returns 501
- **Verification command**: `npm run test:server`
