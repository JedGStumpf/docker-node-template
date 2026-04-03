---
id: "010"
title: "Client — admin UI updates for Meetup, calendar, waitlist, and email queue"
status: todo
use-cases: [SUC-001, SUC-003, SUC-005, SUC-008]
depends-on: [006, 007, 009]
github-issue: ""
todo: ""
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Client — admin UI updates for Meetup, calendar, waitlist, and email queue

## Description

Extend the admin React SPA to surface the new sprint 004 features.

**Event request detail panel additions:**
- Show Meetup event link (`meetupEventUrl`) when present — external link opens in new tab
- Show Google Calendar event status (`googleCalendarEventId` present = synced indicator)
- Show `meetupRsvpCount` badge when available
- Editable `eventCapacity` field (positive integer or blank for unlimited) via `PUT /api/admin/requests/:id`

**Registration list updates:**
- Show waitlist status column — `REGISTERED` vs `WAITLISTED` badge
- Show position number for waitlisted registrations

**New admin page: Email Queue (`/admin/email-queue`):**
- Table listing email queue entries with status filter tabs (all, pending, failed, dead, sent)
- "Retry" button on dead entries — calls `POST /api/admin/email-queue/:id/retry`
- Pagination controls

Add nav link for email queue in admin sidebar/nav.

## Acceptance Criteria

- [ ] Event detail shows Meetup link, Calendar sync indicator, and RSVP count
- [ ] `eventCapacity` is editable inline from the event detail panel
- [ ] Registration list shows waitlist status and position
- [ ] Email queue admin page lists entries with status filter
- [ ] Retry button resets dead emails and updates UI
- [ ] All new UI components have client-side tests

## Testing

- **Existing tests to run**: `npm run test:client` — existing client tests must pass
- **New tests to write**: `tests/client/EventRequestDetail.test.tsx` (new fields), `tests/client/EmailQueueAdmin.test.tsx` (list, filter, retry). Extend registration list tests for waitlist badge.
- **Verification command**: `npm run test:client`
