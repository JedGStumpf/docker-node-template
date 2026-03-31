---
id: '001'
title: "Prisma schema migration \u2014 new site/rep models and EventRequest additions"
status: in-progress
use-cases:
- SUC-001
- SUC-002
depends-on: []
github-issue: ''
todo: ''
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Prisma schema migration — new site/rep models and EventRequest additions

## Description

Add four new Prisma models and three new nullable columns to `EventRequest`. This is the foundation ticket — all other Sprint 2 tickets depend on it.

New models:
- `RegisteredSite` — venue record (name, address, city, state, zipCode, lat, lng, capacity, roomNotes, active, timestamps)
- `SiteInvitation` — tokenized invite (token UUID unique, contactEmail, contactName, registeredSiteId FK nullable, expiresAt, usedAt nullable, createdAt)
- `SiteRep` — venue contact user (email unique, displayName, registeredSiteId FK, timestamps)
- `SiteRepSession` — magic-link token (siteRepId FK, tokenHash unique SHA-256 hex, expiresAt, usedAt nullable, createdAt)

`EventRequest` additions:
- `registeredSiteId` — FK to `RegisteredSite`, nullable
- `emailThreadAddress` — String, nullable
- `asanaTaskId` — String, nullable

Add `SITE_REP` to the `Role` enum (alongside existing `INSTRUCTOR`, `ADMIN`, `USER`).

After updating `schema.prisma`, run the Prisma migration for Postgres and regenerate the SQLite schema via `sqlite-push.sh`.

## Acceptance Criteria

- [ ] `schema.prisma` contains all four new models with correct field types and relations
- [ ] `EventRequest` has three new nullable fields: `registeredSiteId`, `emailThreadAddress`, `asanaTaskId`
- [ ] `Role` enum includes `SITE_REP`
- [ ] `npx prisma migrate dev` succeeds against Postgres
- [ ] `server/prisma/sqlite-push.sh` regenerates the SQLite schema without errors
- [ ] `npx prisma generate` produces updated client types (no TypeScript errors in existing code)
- [ ] All existing server tests still pass (`npm run test:server`)

## Testing

- **Existing tests to run**: `npm run test:server` — all existing tests must pass (schema changes are additive only)
- **New tests to write**: None — schema migration correctness is validated by the Prisma migration tooling and subsequent ticket tests
- **Verification command**: `npm run test:server`
