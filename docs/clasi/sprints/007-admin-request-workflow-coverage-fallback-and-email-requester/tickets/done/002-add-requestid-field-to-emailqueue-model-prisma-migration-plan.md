---
ticket: "002"
status: in-progress
---

# Plan: Add requestId field to EmailQueue model (Prisma migration)

## Approach

1. Add `requestId String?` field and `@@index([requestId])` to `EmailQueue` model in `schema.prisma`.
   - Keep as a bare nullable string column (no FK relation constraint) so emails are preserved if a request is deleted.
2. Run `npx prisma migrate dev --name add-email-queue-request-id` to generate the PostgreSQL migration.
3. Run `bash server/prisma/sqlite-push.sh` to regenerate the SQLite schema and push.
4. Add optional `requestId?: string` to the `EmailMessage` interface in `email.service.ts`.
5. Update `EmailQueueService.enqueue()` to pass `requestId` through when present.
6. Run `npm run test:server` to confirm all tests pass.

## Key Decisions

- **No FK relation**: The ticket says to keep emails for audit if a request is deleted, so `requestId` is a bare `String?` column with an index, not a Prisma relation.
- **Backward compatible**: `requestId` is optional in both the type and the schema, so all existing callers continue to work without changes.
