---
status: pending
---

# Google Calendar Integration — Internal League Calendar

When a private event is confirmed, add the event to the League's internal
Google Calendar. Requires Google Calendar API client, service account
credentials (OAuth or API key), and a shared calendar ID.

Spec references: §3.3, §3.4, §9 Phase 2.

Originally planned for Sprint 3 overview scope but deferred because the
core registration and finalization flows take priority. Google Calendar
is a read/write integration that can be layered on after the event
lifecycle pipeline is stable.

## Notes

- Determine if this is shared-calendar-only (internal tracking) or also
  sends Google Calendar invites to attendees (in addition to iCal .ics).
- Needs `GOOGLE_CALENDAR_ID` and service account credentials in secrets.
- Should degrade gracefully (501) if credentials are missing.
