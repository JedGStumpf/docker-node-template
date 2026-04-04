---
ticket: "002"
sprint: "006"
status: in-progress
---

# Ticket 002 Plan: Expand content fixture with real League classes

## Approach

Replace the 3-class stub in `tests/fixtures/content.json` with 8 entries covering
all the classes referenced by seeded instructors' topic arrays. All classes include
the required fields: slug, title, description, ageRange, topics, typicalDurationMinutes,
equipmentNeeded, requestable.

## Files to Modify

- `tests/fixtures/content.json` — add 5 new entries; keep python-intro, scratch-basics, advanced-robotics

## Testing Plan

- Run `npm run test:server && npm run test:client` — no new tests needed.
- ContentService already handles `file://` URLs; no code changes required.

## Documentation Updates

- None required beyond the fixture file itself.
