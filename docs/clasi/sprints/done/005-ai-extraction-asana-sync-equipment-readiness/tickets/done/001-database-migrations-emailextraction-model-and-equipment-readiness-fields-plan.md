---
ticket: "001"
sprint: "005"
status: in-progress
---

# Plan: Database migrations — EmailExtraction model and equipment readiness fields

## Approach

1. Add three new Prisma migrations:
   - `sprint5_emailextraction_model` — adds `EmailExtraction` model
   - `sprint5_instructor_equipment_fields` — adds `equipmentStatus`, `equipmentCheckedAt`, `equipmentReminderCount` to `InstructorAssignment`
   - `sprint5_instructorprofile_inventory_user_id` — adds `inventoryUserId` to `InstructorProfile`

2. Update `schema.prisma` with the new model and fields.

3. Run `npx prisma migrate dev` and `bash server/prisma/sqlite-push.sh`.

4. Update `ServiceRegistry.clearAll()` to include `emailExtraction.deleteMany()` before `emailQueue.deleteMany()`.

5. Run `npm run test:server` to confirm no regressions.

## Files to change

- `server/prisma/schema.prisma` — add `EmailExtraction` model, new fields on `InstructorAssignment` and `InstructorProfile`
- `server/prisma/migrations/` — new migration files (auto-generated)
- `server/src/services/service.registry.ts` — add `emailExtraction.deleteMany()` to `clearAll()`
