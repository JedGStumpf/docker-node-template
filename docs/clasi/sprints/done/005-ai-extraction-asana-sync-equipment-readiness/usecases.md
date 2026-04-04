---
status: draft
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Sprint 005 Use Cases

## SUC-001: AI Email Extraction
Parent: UC-003 (Email Coordination)

- **Actor**: System (automated, triggered by inbound SES email)
- **Preconditions**: An inbound email has been received and stored for an active event request.
- **Main Flow**:
  1. Email ingestion stores the raw email.
  2. System enqueues an extraction job for the new email.
  3. `EmailExtractionService` calls Claude Haiku with the email body and a structured prompt.
  4. Claude Haiku returns JSON with: `status_signal` (e.g., confirmed, cancelled, rescheduled, none), `action_items` (array of strings), `host_registration_count` (integer or null).
  5. System stores the result in `EmailExtraction` linked to the email and event request.
  6. If `status_signal` is non-trivial, system flags the request for admin review.
- **Postconditions**: `EmailExtraction` record exists; admin UI shows extracted fields in the request detail view.
- **Acceptance Criteria**:
  - [ ] Extraction is stored with all three fields (status signal, action items, host count).
  - [ ] Extraction failure does not block email storage.
  - [ ] Extracted data is visible in admin request detail view.

## SUC-002: Apply Extracted Status Signal
Parent: UC-003

- **Actor**: Admin
- **Preconditions**: An `EmailExtraction` record exists with a non-null `status_signal` of type `confirmed`, `cancelled`, or `rescheduled`.
- **Main Flow**:
  1. Admin views the request detail page.
  2. System shows the extracted signal with an "Apply" action.
  3. Admin clicks Apply.
  4. System transitions the `EventRequest` to the appropriate status.
  5. System logs the state change with source = `email_extraction`.
- **Postconditions**: `EventRequest.status` is updated; audit log reflects email-driven change.
- **Acceptance Criteria**:
  - [ ] Admin can apply a `confirmed` signal to transition request to confirmed state.
  - [ ] State change is logged with extraction source.

## SUC-003: Asana Inbound Webhook Sync
Parent: UC-002 (Asana Task Pipeline)

- **Actor**: Asana (external webhook sender)
- **Preconditions**: Asana webhook is registered for the project. The corresponding `EventRequest` exists in the app.
- **Main Flow**:
  1. Asana sends a POST to `/api/webhooks/asana` with a task change event.
  2. On first contact, endpoint echoes back `X-Hook-Secret` header for handshake.
  3. For subsequent events: system parses the event type and maps Asana task status to `EventRequest` status.
  4. System applies the status change and logs it.
- **Postconditions**: `EventRequest` status reflects Asana task state.
- **Acceptance Criteria**:
  - [ ] Handshake (echo X-Hook-Secret) succeeds.
  - [ ] A task-completed event in Asana transitions the corresponding request.
  - [ ] Unknown event types are logged and ignored without error.

## SUC-004: Automated Asana Update from Extraction
Parent: UC-002, UC-003

- **Actor**: System (automated)
- **Preconditions**: An `EmailExtraction` record contains action items or a status signal.
- **Main Flow**:
  1. `AsanaService` receives the extraction result.
  2. System appends a comment to the Asana task summarizing the extracted action items.
  3. If the signal is `confirmed` or `cancelled`, system updates the Asana task status accordingly.
- **Postconditions**: Asana task has a new comment and/or updated status matching the extraction.
- **Acceptance Criteria**:
  - [ ] Action items from extraction appear as a comment on the Asana task.
  - [ ] Status signal `confirmed` updates the Asana task to the appropriate column/status.

## SUC-005: Instructor Equipment Readiness Check on Acceptance
Parent: UC-004 (Instructor Assignment)

- **Actor**: System (triggered by instructor acceptance)
- **Preconditions**: Instructor has accepted an assignment. `InstructorProfile.inventory_user_id` is set (or not — graceful degradation applies).
- **Main Flow**:
  1. Assignment status transitions to `accepted`.
  2. System calls `EquipmentService.checkReadiness(assignmentId)`.
  3. `EquipmentService` reads `equipmentNeeded` from content.json for the class slug.
  4. `EquipmentService` calls `IInventoryClient.getCheckouts(inventory_user_id)`.
  5. System computes `items_still_needed` = required minus already checked out.
  6a. If empty: set `equipment_status = ready`; send `equipment-ready` email.
  6b. If non-empty: set `equipment_status = pending_checkout`; send `equipment-checkout-prompt` email.
  6c. If `inventory_user_id` unset or API unavailable: set `equipment_status = unknown`; log warning, no email.
- **Postconditions**: `InstructorAssignment.equipment_status` is set; appropriate email queued.
- **Acceptance Criteria**:
  - [ ] Stub returns "all gear present" → status = ready, confirmation email sent.
  - [ ] Stub returns "gear missing" → status = pending_checkout, prompt email sent.
  - [ ] Missing `inventory_user_id` → status = unknown, no email, no error thrown.

## SUC-006: Daily Equipment Readiness Reminder Job
Parent: UC-004

- **Actor**: System (scheduled job, runs daily)
- **Preconditions**: At least one `InstructorAssignment` has `equipment_status = pending_checkout`.
- **Main Flow**:
  1. Job queries all assignments with `equipment_status = pending_checkout`.
  2. For each: calls `IInventoryClient.getCheckouts(inventory_user_id)`.
  3. Recomputes `items_still_needed`.
  4. If now empty: set status to `ready`, send confirmation email, remove from reminder queue.
  5. If still incomplete: increment `equipment_reminder_count`, send `equipment-checkout-reminder` email with days-until-event and items still needed.
  6. Cancelled assignments are skipped.
- **Postconditions**: All pending assignments are re-evaluated; transitioned or reminded as appropriate.
- **Acceptance Criteria**:
  - [ ] Assignment transitions to ready when inventory is complete on re-check.
  - [ ] Reminder email includes items still needed and days until event.
  - [ ] `equipment_reminder_count` increments on each reminder.
  - [ ] Cancelled assignments are not processed.

## SUC-007: Admin Equipment Status Visibility and Override
Parent: UC-001 (Admin Dashboard)

- **Actor**: Admin
- **Preconditions**: An event request has at least one instructor assignment.
- **Main Flow**:
  1. Admin opens the request detail view.
  2. System shows each assignment with its `equipment_status` badge (ready / pending_checkout / unknown).
  3. Admin clicks "Override" on an assignment.
  4. Admin selects new status (ready or unknown) and optionally adds a note.
  5. System calls `POST /api/assignments/:id/equipment-status/override`.
  6. System updates `equipment_status` and logs the admin override.
- **Postconditions**: `equipment_status` is updated; override is recorded in audit log.
- **Acceptance Criteria**:
  - [ ] All three equipment status states render correctly in the admin UI.
  - [ ] Override sets status to ready and stops reminder loop.
  - [ ] Override is logged with admin identity.

## SUC-008: Instructor Dashboard
Parent: UC-004

- **Actor**: Instructor (authenticated via Pike13 OAuth)
- **Preconditions**: Instructor is logged in and has at least one assignment (past or upcoming).
- **Main Flow**:
  1. Instructor navigates to `/instructor/events`.
  2. System shows upcoming assignments (sorted by date) with: class name, date, location, confirmation status, equipment status.
  3. System shows past assignments (last 12 months) in a separate section.
- **Postconditions**: Instructor has a clear view of their schedule and gear readiness.
- **Acceptance Criteria**:
  - [ ] Upcoming and past assignments are separated.
  - [ ] Equipment status badge renders for each assignment.
  - [ ] Page is accessible only to authenticated instructors.
