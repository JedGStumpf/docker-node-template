---
id: '005'
title: AI Extraction, Asana Sync & Equipment Readiness
status: done
branch: sprint/005-ai-extraction-asana-equipment
use-cases:
- SUC-001
- SUC-002
- SUC-003
- SUC-004
- SUC-005
- SUC-006
- SUC-007
- SUC-008
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Sprint 005: AI Extraction, Asana Sync & Equipment Readiness

## Goals

1. Add AI-powered email extraction (Claude Haiku) to pull status signals, action items, and host registration counts from inbound emails and apply them to event requests automatically.
2. Complete Asana bidirectional sync: automate updates from email content into Asana tasks, and receive Asana webhook events to propagate status changes back to the app.
3. Implement the instructor equipment readiness workflow (FEAT-2): check instructor inventory on assignment acceptance, send readiness notifications and daily reminders, and expose equipment status in admin UI — all backed by a stub inventory API client so the full workflow is exercisable without a live API key.
4. Build the instructor dashboard with personal event history and upcoming assignments.
5. Add analytics and reporting for admins: event volume, funnel metrics, and instructor utilization.
6. Handle previously deferred edge cases: late participant additions, no-instructor-available workflows, Meetup group mapping edge cases.
7. Add optional donation link customization per event (Give Lively URL).

## Problem

Sprints 1–4 built the core request, registration, public event, and email coordination workflows. Three gaps remain before the system is production-ready:

- **Inbound email intelligence:** Emails sent to per-request addresses contain useful signals (host confirmations, registration counts, action items) that currently require manual admin reading. The system should extract these signals automatically and update event state accordingly.
- **Asana sync is one-way:** Sprint 2 creates Asana tasks on request verification. Status changes in Asana (e.g., an admin closes a task) do not flow back to the app. The spec requires bidirectional sync.
- **Instructor gear readiness gap:** After acceptance, no mechanism verifies the instructor actually has the required equipment. Events have been disrupted when instructors arrive without gear. The system must close this loop.

## Solution

**AI Email Extraction:** Inbound emails processed by the SES Lambda are currently stored raw. Sprint 5 adds a `EmailExtractionService` that calls Claude Haiku with a structured prompt to extract: (a) status signals (e.g., "confirmed", "cancelled", "rescheduled"), (b) action items for admins, and (c) host registration counts. Extracted data is stored in a new `EmailExtraction` model and optionally applied to event state. The extraction runs asynchronously after email ingestion; failures are logged but do not block email storage.

**Asana Bidirectional Sync:** A new `AsanaWebhookService` handles incoming webhook events from Asana (task status changes, comments). Relevant changes are mapped to `EventRequest` status updates. Outbound: `AsanaService` (already exists for task creation) is extended to push automated updates when email extractions produce action items or status signals.

**Instructor Equipment Readiness (FEAT-2):** A new `EquipmentService` implements the check-on-acceptance flow using an `IInventoryClient` interface. Sprint 5 ships a `StubInventoryClient` that returns configurable mock responses, enabling all UI states (ready, pending_checkout, unknown) to be exercised in tests without a live API key. The `InstructorAssignment` model gains three new fields. Three new email templates are added. A new daily scheduled job (`equipment-readiness-check`) re-checks pending assignments. Admin UI shows equipment status per assignment with an override control.

**Instructor Dashboard:** A new React view at `/instructor/events` shows the instructor's upcoming and past assignments, confirmation status, and equipment readiness state.

**Analytics:** A new `AnalyticsService` and admin dashboard page expose event funnel metrics (requests → discussing → confirmed → completed), instructor utilization (assignments per instructor per time period), and registration counts.

**Edge cases and polish:** Late participant additions, no-instructor-available notification flow, Meetup group mapping fallback handling, and Give Lively donation link per event.

## Success Criteria

- [ ] An inbound email to a request address is processed by Claude Haiku; extracted fields (status signal, action items, host count) are stored in `EmailExtraction` and visible in admin UI.
- [ ] A status signal of type `confirmed` in an extraction can be applied to the event request with admin confirmation.
- [ ] An Asana webhook event (task status change) updates the corresponding `EventRequest` status in the app.
- [ ] An outbound Asana update is triggered when an email extraction produces an action item.
- [ ] When an instructor accepts an assignment, `EquipmentService` is called; if stub returns "all gear present", `equipment_status` is set to `ready` and a confirmation email is sent.
- [ ] When the stub returns "gear missing", `equipment_status` is set to `pending_checkout` and a prompt email is sent immediately.
- [ ] The daily `equipment-readiness-check` job processes all `pending_checkout` assignments; transitions to `ready` when stub inventory returns complete.
- [ ] Admin can see equipment status per assignment in the request detail view and manually override it.
- [ ] Instructor dashboard shows upcoming and past assignments with equipment status.
- [ ] Admin analytics page shows event funnel metrics and instructor utilization.
- [ ] All new API routes have happy-path and auth/error tests passing.
- [ ] Full test suite (`npm run test:server`, `npm run test:client`) passes green.

## Scope

### In Scope

- AI email extraction service (Claude Haiku), `EmailExtraction` model, extraction UI in admin request detail
- Asana webhook endpoint and inbound sync: map task status changes to `EventRequest`
- Asana outbound automation: push action items and status signals from extractions to Asana tasks
- FEAT-2 Instructor Equipment Readiness: full workflow with `StubInventoryClient`, data model changes, email templates, daily job, admin UI, override API
- `inventory_user_id` field on `InstructorProfile` (admin-set)
- Instructor dashboard: event history + upcoming assignments with equipment status
- Admin analytics: event funnel, instructor utilization, registration counts
- Edge cases: late participant additions to confirmed events, no-instructor-available notification (admin alert when no match found after reminder cycle), Meetup group mapping fallback logging
- Give Lively donation URL: optional per-event field, rendered in public event page and emails
- All new routes tested (happy path + auth/error)

### Out of Scope

- Live inventory API wiring (`RealInventoryClient`) — deferred until API contract is finalized and UI is validated
- Requester registration visibility TODO — stakeholder has deferred; not included
- `inventory_user_id` self-service by instructor — admin-set only in this sprint
- Structured `equipmentNeeded` schema update on jointheleague.org content.json — Sprint 5 will parse best-effort from the string; structured data is a follow-up
- Multi-session course support
- Payment processing
- Routing API for geographic matching upgrade

## Test Strategy

- **Server tests** (`tests/server/`): One test file per new service and per new route group. Each new API route gets a happy-path test and an auth/error test. Equipment readiness tests use `StubInventoryClient` directly — no HTTP mocking needed.
- **Email extraction tests**: Use a mock Claude Haiku client that returns fixed JSON responses. Test that `EmailExtractionService` stores the result correctly and that the status-signal application path works.
- **Asana webhook tests**: POST a synthetic Asana webhook payload to the endpoint; assert the corresponding `EventRequest` is updated.
- **Scheduled job tests**: Call `equipmentReadinessCheck()` directly in tests with pre-seeded `pending_checkout` assignments; assert status transitions and email queue rows.
- **Client tests** (`tests/client/`): Instructor dashboard component renders assignment list; admin equipment status badge renders all three states.
- **All tests must pass before any ticket is marked done.**

## Architecture Notes

- `IInventoryClient` interface allows stub/real swap at construction time without workflow changes.
- Claude Haiku extraction is fire-and-forget from the email ingestion path: email is stored first, extraction enqueued. Extraction failures never block email storage.
- Asana webhook requires a registered webhook URL (`/api/webhooks/asana`). Asana sends a handshake `X-Hook-Secret` header on first contact; the endpoint must echo it back.
- Equipment readiness daily job uses `FOR UPDATE SKIP LOCKED` (PostgreSQL) / single-writer (SQLite) — same concurrency pattern as the email-sender job.
- Analytics queries use Prisma aggregation methods; no raw SQL for now.

## GitHub Issues

(None yet — to be linked after ticket creation.)

## Definition of Ready

Before tickets can be created, all of the following must be true:

- [x] Sprint planning documents are complete (sprint.md, use cases, architecture)
- [x] Architecture review passed
- [x] Stakeholder has approved the sprint plan

## Tickets

| # | Title | Status | Depends On |
|---|-------|--------|-----------|
| 001 | Database migrations: EmailExtraction model and equipment readiness fields | todo | — |
| 002 | IInventoryClient interface and StubInventoryClient implementation | todo | 001 |
| 003 | EquipmentService: readiness check on instructor acceptance | todo | 001, 002 |
| 004 | Equipment readiness email templates and admin override API | todo | 003 |
| 005 | equipment-readiness-check daily scheduled job | todo | 003, 004 |
| 006 | EmailExtractionService: Claude Haiku AI email extraction | todo | 001 |
| 007 | Asana bidirectional sync: webhook endpoint and outbound automation | todo | 006 |
| 008 | Admin equipment status UI and instructor dashboard | todo | 003, 004 |
| 009 | Admin analytics: event funnel and instructor utilization | todo | 001 |
| 010 | Edge cases: late participant additions, no-instructor-available workflow, Meetup group mapping, Give Lively donation link | todo | 001 |
