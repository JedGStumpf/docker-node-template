# Feature: Instructor Equipment Readiness

**Tech Club Event Request System**
Feature Document — April 2026
Base specification: Tech Club Event Request System v0.5
Extends: §2.1 Equipment Reservation

---

## 1. Summary

Add an instructor-centric equipment readiness workflow that triggers when an instructor accepts a
class assignment. The system checks the instructor's current inventory against what the class
requires, notifies them if they're already equipped, or prompts them to check out the missing
gear and sends daily reminders until they do. A background job re-checks each pending
instructor's inventory once per day.

This extends and partially replaces the original spec's equipment reservation model (§2.1,
§7 Equipment tracking), which treated equipment availability as a scheduling constraint. That
constraint model is preserved for date-offering; this feature adds the instructor-side
readiness loop that runs after acceptance.

---

## 2. Problem

The original spec checks equipment availability when showing available dates to a requester
(if gear is unavailable, that date isn't offered) and reserves equipment when an event is
confirmed. This handles the availability side but leaves a gap: once an instructor accepts an
assignment, nobody verifies they actually have the right gear on hand or prompts them to check
it out before the event.

Currently, gear readiness relies on the instructor remembering to check out equipment. Events
have been disrupted when instructors show up without the right robots, laptops, or micro:bits.
The system should close this loop automatically.

---

## 3. Feature Description

### 3.1 Trigger

The equipment readiness flow starts immediately when an instructor accepts an assignment
(the assignment status transitions to `accepted`). This follows the existing consent flow
described in spec §3.2.

### 3.2 Stage 1 — Inventory Check

On acceptance, the system calls the inventory API to determine:

- **What the class requires:** sourced from the `equipmentNeeded` field in content.json for
  the assigned class slug. This is a list of equipment types and quantities (e.g., 2× EV3 robot
  kits, 15× micro:bits).
- **What the instructor currently has checked out:** queried from the inventory API by instructor
  ID (Pike13 user ID maps to inventory user).

The system computes the delta: required items minus items already checked out = items still needed.

### 3.3 Stage 2a — Already Equipped

If `items_still_needed` is empty (instructor has all required gear already checked out):

- Send a confirmation notification to the instructor: "You're all set — you already have the
  equipment for [class name] on [date]."
- Set `equipment_status` on the instructor assignment to `ready`.
- No further reminders needed.

### 3.4 Stage 2b — Gear Needed

If `items_still_needed` is non-empty:

- Send an immediate prompt to the instructor listing the specific items they still need to
  check out, with a direct link to the inventory checkout system.
- Set `equipment_status` to `pending_checkout`.
- Enqueue the assignment for daily reminder tracking.

**Daily reminder loop:**

A background job runs once per day. For each instructor assignment where `equipment_status`
is `pending_checkout`:

1. Re-query the inventory API for that instructor's current checkout state.
2. Recompute `items_still_needed` against the class requirements.
3. If now empty: set `equipment_status` to `ready`, send a confirmation, remove from reminder
   queue.
4. If still incomplete: send a daily reminder email listing the remaining items, with a
   checkout link. Include a count of days until the event so urgency increases naturally.

The reminder loop stops automatically when the instructor has the gear or if the assignment
is cancelled.

### 3.5 Admin Visibility

Admins can see `equipment_status` per assignment in the request detail view:

- `ready` — instructor has all gear
- `pending_checkout` — gear still needed, reminders active
- `unknown` — inventory API unavailable or instructor not mapped

Admins can manually override `equipment_status` (e.g., if an instructor verbally confirmed
they have the gear from a prior event and won't check it out again).

### 3.6 Inventory API Integration

The inventory API client is implemented as a service interface with a configurable API key.
When the key is not set, all inventory checks return a graceful `unknown` status and the
system does not send readiness notifications — it degrades silently rather than blocking the
workflow.

The API client surface required:

```
GET /instructors/{inventory_user_id}/checkouts
  → [{ item_type: string, quantity: number, due_date: string }]

POST /events/{event_id}/reserve
  → { reservation_id: string, items: [...] }   (used by original spec reservation flow)
```

The instructor identity mapping (Pike13 user ID → inventory user ID) is stored as a field on
the `InstructorProfile` model.

---

## 4. Interaction with Existing Spec

### 4.1 Equipment Reservation (§2.1 and §7)

The original spec's equipment reservation model is **preserved** for the scheduling constraint
use case: equipment availability still gates which dates are offered to requesters, and a
reservation is still created when the event is confirmed. This feature adds the
instructor-readiness loop that runs *after* acceptance, which the original model did not cover.

The two flows share the same inventory API client but serve different purposes:

| Flow | When | Purpose |
|------|------|---------|
| Date availability check (original) | Requester picks dates | Don't offer dates where gear is unavailable |
| Event confirmation reservation (original) | Admin confirms event | Reserve gear against the confirmed date |
| Instructor readiness check (this feature) | Instructor accepts assignment | Verify instructor personally has the gear; remind if not |

### 4.2 Changes to Data Model

**Modified: InstructorAssignment**

Add:
- `equipment_status` — enum: `ready`, `pending_checkout`, `unknown`. Default: `unknown`.
- `equipment_checked_at` — timestamp of last inventory API check.
- `equipment_reminder_count` — integer, incremented each time a reminder is sent.

**Modified: InstructorProfile**

Add:
- `inventory_user_id` — string, nullable. Maps the instructor's Pike13 identity to their
  inventory system account. Set by admin or during profile completion.

### 4.3 Changes to Email Templates

New email templates:

- **`equipment-ready`** — sent when instructor already has all gear at acceptance time
- **`equipment-checkout-prompt`** — sent immediately when gear is missing; lists items and
  checkout link
- **`equipment-checkout-reminder`** — daily reminder; includes items still needed, days until
  event, and checkout link

### 4.4 Changes to Scheduled Jobs

The existing job scheduler (spec §3.5, Sprint 3 `008-scheduled-jobs`) gains a new daily job:
`equipment-readiness-check`. Runs once per day, checks all assignments with
`equipment_status = pending_checkout`, re-queries inventory, and fires reminders or
transitions to `ready` as appropriate.

### 4.5 Changes to Phasing (§9)

This feature is added to **Phase 3** alongside AI extraction and Asana sync. It is implemented
in Sprint 5 as a fully built workflow with a stubbed inventory API client. The stub returns
configurable mock data and drives all UI states (ready, pending_checkout, unknown) so the
full interface can be exercised and tested without a live inventory connection.

The live inventory API wiring (real HTTP calls using `INVENTORY_API_KEY` and
`INVENTORY_API_BASE_URL`) is a follow-on task, scheduled after the UI is validated through
testing. No code restructuring is required to make the switch — only the client
implementation layer changes.

---

## 5. API Sketch

### `GET /api/assignments/{assignment_id}/equipment-status`

Authenticated (instructor or admin). Returns the current equipment status for an assignment.

```json
{
  "status": "pending_checkout",
  "required": [{ "item_type": "EV3 Robot Kit", "quantity": 2 }],
  "checked_out": [{ "item_type": "EV3 Robot Kit", "quantity": 1 }],
  "still_needed": [{ "item_type": "EV3 Robot Kit", "quantity": 1 }],
  "last_checked_at": "2026-04-03T10:00:00Z",
  "reminder_count": 2
}
```

### `POST /api/assignments/{assignment_id}/equipment-status/override`

Authenticated (admin only). Manually set `equipment_status` to `ready` or `unknown`.

---

## 6. Resolved Decisions

**Trigger point.** Equipment check fires on instructor acceptance, not on event confirmation.
Reason: earlier trigger gives more time for the instructor to obtain gear before the event.

**Daily reminder cadence.** One email per day. Not configurable per event in v1 — the daily
cadence is a safe default. An admin override on `equipment_status` handles edge cases where
the system is wrong.

**Graceful degradation.** When `INVENTORY_API_KEY` is unset, all checks return `unknown` and
no readiness emails are sent. The rest of the assignment flow is unaffected. Admin visibility
shows `unknown` in the request detail view.

**Inventory user ID mapping.** Stored on `InstructorProfile`, set by admin. If not set,
equipment check returns `unknown` and logs a warning.

**Stub implementation.** Sprint 5 ships a fully functional workflow with a stub inventory API
client that drives all UI states using configurable mock data. The live client (real HTTP calls
to the inventory API) is implemented as a follow-on task once the UI has been validated through
testing. The stub and live client share the same interface — switching is a client-layer swap,
not a workflow change.

---

## 7. Open Questions

**Inventory API contract.** The API contract is not yet finalized. The client interface above
is designed based on the minimum surface needed for this feature. The real API may differ.
Needs coordination with inventory system development before the live client can be wired up.

**inventory_user_id onboarding.** How does an instructor get their inventory user ID linked
to their profile? Options: (a) admin sets it manually, (b) instructor enters it during profile
setup, (c) inventory system shares an email-based lookup. This is deferred to implementation
— for Sprint 5, admin sets it manually.

**Equipment requirements source.** `equipmentNeeded` in content.json is currently a
free-text field (e.g., "15 micro:bits, 1 laptop"). For machine-readable inventory checks,
this needs to be a structured list `[{ item_type, quantity }]`. Requires a content.json
schema update on the jointheleague.org side. Sprint 5 will parse best-effort from the string;
structured data is a follow-up.
