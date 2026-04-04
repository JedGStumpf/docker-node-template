---
id: '001'
title: "Dev seed data \u2014 instructors, sites, admin user"
status: done
use-cases: []
depends-on: []
github-issue: ''
todo: ''
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Dev seed data — instructors, sites, admin user

## Description

Create `server/prisma/seed.ts` that upserts dev data so the request form works end-to-end locally. Must be idempotent (safe to run multiple times). Hook into `package.json` `prisma.seed` config so `npx prisma db seed` runs it automatically.

Seed data to create:
- 3 instructors with varying zip codes (92101, 90210, 10001), topics (python/scratch, robotics, game-design), and radiusMiles 50
- 2 registered sites: a library and a school, each with a site rep user
- 1 admin user (email: admin@jointheleague.org, role: ADMIN)

## Acceptance Criteria

- [ ] `npx prisma db seed` runs without error on a fresh dev database
- [ ] Running it twice does not duplicate records (upserts, not inserts)
- [ ] After seeding, `GET /api/requests/availability?zip=92101&classSlug=python-intro` returns `available: true`
- [ ] Dev README or comment in seed file explains what data is created

## Testing

- **Existing tests to run**: `npm run test:server` — verify no regressions in request/availability routes
- **New tests to write**: No automated test needed; manual verification via the availability endpoint is the acceptance check
- **Verification command**: `npx prisma db seed && curl "http://localhost:3000/api/requests/availability?zip=92101&classSlug=python-intro"`
