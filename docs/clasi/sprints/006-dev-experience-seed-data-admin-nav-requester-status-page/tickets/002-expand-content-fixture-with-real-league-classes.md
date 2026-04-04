---
id: "002"
title: "Expand content fixture with real League classes"
status: todo
use-cases: []
depends-on: []
github-issue: ""
todo: ""
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Expand content fixture with real League classes

## Description

Replace the 2-class stub in `tests/fixtures/content.json` with 6-8 classes matching the League's actual curriculum. Also verify `config/dev/public.env` uses the `file://` path (not the broken jointheleague.org URL) so the dev server loads content from the fixture.

Classes to add (all `requestable: true` unless noted):
- python-intro
- scratch-basics
- javascript-intro
- game-design
- robotics-intro
- web-design
- data-science-intro
- advanced-robotics (`requestable: false`)

Each class entry must include: `slug`, `title`, `description`, `ageRange`, `topics`, `typicalDurationMinutes`, `equipmentNeeded`, `requestable`.

## Acceptance Criteria

- [ ] `tests/fixtures/content.json` has at least 6 requestable classes
- [ ] Each class has: slug, title, description, ageRange, topics, typicalDurationMinutes, equipmentNeeded, requestable
- [ ] `config/dev/public.env` CONTENT_JSON_URL uses `file://` path pointing to the fixture
- [ ] All existing tests still pass (`npm run test:server && npm run test:client`)

## Testing

- **Existing tests to run**: `npm run test:server && npm run test:client`
- **New tests to write**: None — the fixture is test data; existing content-loading tests cover correctness
- **Verification command**: `npm run test:server && npm run test:client`
