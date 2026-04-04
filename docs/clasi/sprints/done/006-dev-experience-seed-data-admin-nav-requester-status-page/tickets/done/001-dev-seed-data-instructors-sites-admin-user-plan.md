---
ticket: "001"
sprint: "006"
status: in-progress
---

# Ticket 001 Plan: Dev seed data — instructors, sites, admin user

## Approach

Rewrite `server/prisma/seed.ts` to:
1. Use the same dual-adapter pattern as `server/src/services/prisma.ts` — detect `DATABASE_URL` prefix to choose between SQLite and PostgreSQL adapters.
2. Upsert 3 instructor profiles, 2 registered sites, 1 admin user, and retain the existing "general" channel upsert.
3. Handle SQLite array field JSON encoding manually (topics, serviceZips) since the seed script does not use the $extends middleware.

## Key Design Decisions

- Use `JSON.stringify([...])` for array fields when `DATABASE_URL.startsWith('file:')` — the seed script doesn't have the Prisma middleware layer that the app uses.
- All upserts use `pike13UserId` as unique key for InstructorProfile, `email` for User, `name` for RegisteredSite and Channel.
- Instructors: zip codes 92101, 90210, 10001 with topics matching fixture classes.
- Sites: a library and a school with realistic address data.
- Admin user: email admin@jointheleague.org, role ADMIN.

## Files to Modify

- `server/prisma/seed.ts` — complete rewrite

## Testing Plan

- Manual: `npx prisma db seed` should run without error.
- Regression: `npm run test:server` must pass.
- No new automated tests required for this ticket.

## Documentation Updates

- Inline comments in seed.ts explaining what data is created.
