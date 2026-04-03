---
sprint: "005"
status: draft
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Architecture Update -- Sprint 005: AI Extraction, Asana Sync & Equipment Readiness

## What Changed

### New Services

**`EmailExtractionService`** (`server/src/services/email-extraction.service.ts`)
- Accepts a raw email record and calls the Claude Haiku API with a structured extraction prompt.
- Returns `{ status_signal, action_items, host_registration_count }`.
- Stores result in new `EmailExtraction` Prisma model.
- Fire-and-forget from email ingestion: called asynchronously; failures are caught, logged, and do not propagate.

**`EquipmentService`** (`server/src/services/equipment.service.ts`)
- Implements the instructor equipment readiness workflow.
- Depends on `IInventoryClient` interface injected at construction time.
- Reads `equipmentNeeded` from content.json (via existing `ContentService`), parses the string into structured items (best-effort).
- Computes delta, sets `equipment_status` on `InstructorAssignment`, enqueues emails.

**`AsanaWebhookService`** (`server/src/services/asana-webhook.service.ts`)
- Handles inbound Asana webhook events.
- Maps Asana task status changes to `EventRequest` status transitions.
- Handles the `X-Hook-Secret` handshake on first contact.
- Extends existing `AsanaService` for outbound comment/status pushes.

**`AnalyticsService`** (`server/src/services/analytics.service.ts`)
- Read-only service. Uses Prisma aggregation for event funnel metrics, instructor utilization, and registration counts.
- No raw SQL in v1.

### New Interface and Stub

**`IInventoryClient`** (`server/src/services/inventory/inventory-client.interface.ts`)
- Interface: `getCheckouts(inventoryUserId: string): Promise<CheckoutItem[]>`
- `CheckoutItem`: `{ item_type: string; quantity: number; due_date: string }`

**`StubInventoryClient`** (`server/src/services/inventory/stub-inventory-client.ts`)
- Implements `IInventoryClient`.
- Returns configurable mock data controlled by `INVENTORY_STUB_MODE` env var (values: `ready`, `pending`, `unknown`).
- Default: `pending` (gear missing) so the reminder flow is always exercisable in dev/test.

### Data Model Changes

**`InstructorAssignment`** (modified)
- Add `equipment_status`: enum `ready | pending_checkout | unknown`, default `unknown`.
- Add `equipment_checked_at`: `DateTime?`
- Add `equipment_reminder_count`: `Int`, default `0`.

**`InstructorProfile`** (modified)
- Add `inventory_user_id`: `String?` — nullable, admin-set.

**`EmailExtraction`** (new model)
- Fields: `id`, `emailId` (FK to inbound email), `requestId` (FK to `EventRequest`), `status_signal` (String?), `action_items` (String[] / JSONB), `host_registration_count` (Int?), `applied_at` (DateTime?), `created_at`.

### New Email Templates

- `equipment-ready` — sent when instructor has all required gear at acceptance.
- `equipment-checkout-prompt` — sent immediately when gear is missing; lists items and checkout link.
- `equipment-checkout-reminder` — daily reminder; includes remaining items, days until event, checkout link.

### New Scheduled Job

**`equipment-readiness-check`** — added to the existing job scheduler (from Sprint 3).
- Queries `InstructorAssignment` where `equipment_status = pending_checkout` and assignment is not cancelled.
- Uses `FOR UPDATE SKIP LOCKED` (PostgreSQL) / single-writer (SQLite) — same pattern as `email-sender`.
- Runs once daily.

### New API Routes

- `GET /api/assignments/:id/equipment-status` — instructor or admin; returns status + required/checked-out/still-needed items.
- `POST /api/assignments/:id/equipment-status/override` — admin only; sets status to `ready` or `unknown`.
- `POST /api/webhooks/asana` — public (Asana-signed); handles webhook handshake and event delivery.
- `GET /api/admin/analytics` — admin only; returns event funnel and instructor utilization data.
- `GET /api/instructor/events` — instructor only; returns upcoming and past assignments.

### New React Views

- `/instructor/events` — Instructor dashboard (upcoming + past assignments, equipment status badges).
- Admin request detail: equipment status section per assignment with override control.
- Admin analytics page: event funnel chart and instructor utilization table.

### ServiceRegistry Updates

All new services registered in `ServiceRegistry`. `EquipmentService` receives `IInventoryClient` from registry construction — stub in dev/test, real client when `INVENTORY_API_KEY` is set (real client is a future follow-on; for Sprint 5 stub is always used unless the key is present).

## Why

- Sprint 4 completed the public event and registration workflows. The remaining production gaps are: unprocessed inbound email intelligence, one-way Asana sync, and no instructor gear verification loop.
- FEAT-2 (equipment readiness) was scoped and fully specified before Sprint 5 began. The stub-first approach lets the full UI and job workflow be tested and validated without blocking on the external inventory API contract, which is not yet finalized.

## Impact on Existing Components

- **Email ingestion path** (`server/src/services/email.service.ts`): gains an async call to `EmailExtractionService` after storing the raw email. The call is fire-and-forget; existing behavior is unchanged on failure.
- **`AsanaService`**: extended with `pushExtractionUpdate(requestId, extraction)` method. Existing task creation (Sprint 2) is unchanged.
- **Job scheduler** (Sprint 3): one new job entry added (`equipment-readiness-check`). No changes to the scheduler itself.
- **`InstructorAssignment` Prisma model**: three new nullable/defaulted fields — migration is additive, no existing data affected.
- **`InstructorProfile` Prisma model**: one new nullable field — additive migration.
- **Admin request detail view**: new equipment status section added below instructor assignment list.
- **`ServiceRegistry`**: two new service instantiations; no changes to existing service construction.

## Migration Concerns

- Two additive Prisma migrations:
  1. Add `equipment_status`, `equipment_checked_at`, `equipment_reminder_count` to `InstructorAssignment`.
  2. Add `inventory_user_id` to `InstructorProfile`.
  3. Create `EmailExtraction` table.
- All new fields are nullable or have defaults. No backfill required. Existing rows will have `equipment_status = unknown` and `inventory_user_id = null` after migration.
- SQLite schema: generated via `sqlite-push.sh` as in prior sprints. No PostgreSQL-specific SQL used.
- No deployment sequencing concerns: new routes and jobs activate only when new code is deployed.
