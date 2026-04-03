---
id: "008"
title: "Scheduled jobs — email-sender, meetup-rsvp-sync"
status: todo
use-cases: [SUC-002, SUC-007]
depends-on: [002, 003]
github-issue: ""
todo: ""
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Scheduled jobs — email-sender, meetup-rsvp-sync

## Description

Register two new scheduled jobs with `SchedulerService` at app startup.

**`email-sender`** — runs on every scheduler tick (60s). Calls `emailQueueService.processPending(transport, 20)` to send pending emails from the queue. No new `ScheduledJob` DB row needed — registered as a tick handler.

**`meetup-rsvp-sync`** — daily job. Finds confirmed public `EventRequest` records where `meetupEventId` is set and `confirmedDate > now`. For each, calls `meetupService.syncRsvps(requestId)`. Errors for one event don't prevent syncing others (catch per-event, log error).

**Seed `meetup-rsvp-sync` job row** in `ScheduledJob` table via seed script or app startup (same pattern as existing `daily-backup`, `weekly-backup` jobs).

## Acceptance Criteria

- [ ] `email-sender` handler registered and runs on every scheduler tick
- [ ] `email-sender` calls `emailQueueService.processPending()` with the real transport
- [ ] `meetup-rsvp-sync` job row created in `ScheduledJob` table (daily frequency)
- [ ] `meetup-rsvp-sync` handler queries confirmed public events with future dates
- [ ] Each event synced independently (one failure doesn't block others)
- [ ] Existing scheduled jobs unaffected

## Testing

- **Existing tests to run**: `npm run test:server` — existing scheduler tests must pass
- **New tests to write**: `tests/server/email-sender-job.test.ts` — job processes queue, `tests/server/meetup-rsvp-sync-job.test.ts` — job syncs RSVPs for valid events, skips past events, handles per-event errors
- **Verification command**: `npm run test:server`
