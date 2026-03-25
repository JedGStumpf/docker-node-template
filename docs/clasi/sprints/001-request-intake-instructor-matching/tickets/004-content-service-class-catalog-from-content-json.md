---
id: "004"
title: "Content service — class catalog from content.json"
status: todo
use-cases:
  - SUC-001
  - SUC-002
depends-on:
  - "001"
github-issue: ""
todo: ""
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Content service — class catalog from content.json

## Description

Implement `ContentService` to fetch, parse, and cache the class catalog from jointheleague.org's `content.json`. The service filters for classes flagged `requestable: true` and exposes a method to look up a single class by slug. This is a prerequisite for the request intake form (ticket 007), which needs to validate that a class slug is requestable and display class metadata.

## Acceptance Criteria

- [ ] `ContentService.getRequestableClasses()` fetches `content.json` from `CONTENT_JSON_URL` and returns only classes with `requestable: true`
- [ ] `ContentService.getClassBySlug(slug)` returns the class record or `null` if not found or not requestable
- [ ] Results are cached in-memory with a TTL of `CONTENT_CACHE_TTL_MS` (default 300000 ms); a second call within the TTL does not make a second HTTP request
- [ ] Cache is invalidated after TTL expires and re-fetched on next call
- [ ] In test environment, `CONTENT_JSON_URL` points to a local fixture file (`tests/fixtures/content.json`) — no real HTTP calls in tests
- [ ] The fixture file contains at least 2 requestable classes and 1 non-requestable class for testing

## Testing

- **Existing tests to run**: `npm run test:server`
- **New tests to write**: `tests/server/content-service.test.ts` — fixture-based tests for `getRequestableClasses` (filters correctly), `getClassBySlug` (found, not-found, non-requestable), and cache TTL behavior (spy on fetch to count calls).
- **Verification command**: `npm run test:server`

## Implementation Notes

- Use `node-fetch` or the built-in `fetch` (Node 18+) for the HTTP call.
- Class record shape (from spec §4.5): `slug`, `title`, `description`, `ageRange`, `topics`, `typicalDurationMinutes`, `equipmentNeeded`, `requestable`.
- Service file: `server/src/services/content.service.ts`.
- Add `CONTENT_JSON_URL` and `CONTENT_CACHE_TTL_MS` to `config/dev/public.env` and document in `docs/secrets.md`.
