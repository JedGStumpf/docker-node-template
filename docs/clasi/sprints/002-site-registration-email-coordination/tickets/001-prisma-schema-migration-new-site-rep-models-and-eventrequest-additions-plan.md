---
ticket: "001"
sprint: "002"
---

# Ticket 001 Plan — Prisma Schema Migration

## Approach

Additive schema changes only. Add four new models and three nullable columns to `EventRequest`. No existing models are altered except `EventRequest`. Run the Postgres migration, regenerate the SQLite schema, regenerate the Prisma client, and confirm existing tests pass.

The ticket description mentions adding `SITE_REP` to a "Role enum", but examining the codebase, `UserRole` only contains `USER` and `ADMIN` — instructors use separate session-based Pike13 auth, not UserRole. Site reps will follow the same session-based pattern (session fields `siteRepId`, etc. added later in ticket 006). Do NOT add SITE_REP to `UserRole` in this ticket — it would pollute the User table enum with an identity type for a completely separate model.

`SiteRep.googleId` is NOT included — deferred per sprint decision 2.

## Files to Create or Modify

- **`server/prisma/schema.prisma`** — Add models and EventRequest columns (detailed below)
- No application source files change in this ticket

## Schema Changes

### New Models

```prisma
model RegisteredSite {
  id         Int       @id @default(autoincrement())
  name       String
  address    String
  city       String
  state      String
  zipCode    String
  lat        Float?
  lng        Float?
  capacity   Int?
  roomNotes  String?
  active     Boolean   @default(true)
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  invitations   SiteInvitation[]
  reps          SiteRep[]
  requests      EventRequest[]
}

model SiteInvitation {
  id               Int              @id @default(autoincrement())
  token            String           @unique
  contactEmail     String
  contactName      String
  registeredSiteId Int?
  expiresAt        DateTime
  usedAt           DateTime?
  createdAt        DateTime         @default(now())

  site             RegisteredSite?  @relation(fields: [registeredSiteId], references: [id])
}

model SiteRep {
  id               Int            @id @default(autoincrement())
  email            String         @unique
  displayName      String
  registeredSiteId Int
  createdAt        DateTime       @default(now())
  updatedAt        DateTime       @updatedAt

  site             RegisteredSite @relation(fields: [registeredSiteId], references: [id])
  sessions         SiteRepSession[]
}

model SiteRepSession {
  id         Int       @id @default(autoincrement())
  siteRepId  Int
  tokenHash  String    @unique
  expiresAt  DateTime
  usedAt     DateTime?
  createdAt  DateTime  @default(now())

  siteRep    SiteRep   @relation(fields: [siteRepId], references: [id], onDelete: Cascade)
}
```

### EventRequest additions

Add after `updatedAt`:
```prisma
  registeredSiteId   Int?
  emailThreadAddress String?
  asanaTaskId        String?

  site               RegisteredSite? @relation(fields: [registeredSiteId], references: [id])
```

## Testing Plan

- **No new test files** — schema migration correctness is validated by Prisma tooling
- **Regression**: Run `npm run test:server` to confirm all 90+ existing tests still pass
- Migration is additive only; no existing columns or models are touched

## Migration Steps

1. Edit `server/prisma/schema.prisma`
2. `cd server && npx prisma migrate dev --name sprint-002-site-registration`
3. `cd server && bash prisma/sqlite-push.sh` (with `DATABASE_URL=file:./data/dev.db`)
4. `cd server && npx prisma generate` (updates TS types)
5. `npm run test:server`

## Notes

- `sqlite-push.sh` strips `@db.*` annotations and replaces the provider — no manual edits needed for the new models since they use only standard types (no `@db.VarChar` etc.)
- SQLite doesn't support `Int[]`/`String[]` but none of the new models use arrays
