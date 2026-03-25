# Feature: Native Event Registration & Attendance Tracking

**Tech Club Event Request System**
Feature Document — March 2026
Base specification: Tech Club Event Request System v0.5

---

## 1. Summary

Add native event registration to the Tech Club system so that parents can register their children directly through jointheleague.org, rather than relying solely on Meetup for public event RSVPs. The system tracks registrations from both its own pages and Meetup, maintains a unified capacity count, and provides a post-event attendance reconciliation tool for instructors.

The registration interface is delivered as an Astro component on the League's existing event pages, which also serves as the entry point for requesting new events.

---

## 2. Problem

The current spec (v0.5) routes all public event registration through Meetup. This creates several limitations:

- Meetup captures guests as a flat count. There's no distinction between parents and children, so it's impossible to know how many kids are actually attending.
- The League can't collect child-specific information (name, age) or guardian contact details through Meetup.
- Meetup doesn't support a volunteer role — adults who want to help at an event register the same way as attendees.
- The League has no control over the registration form fields or the attendee experience.
- Capacity tracking is unreliable because Meetup guest counts mix adults and children.
- Post-event, there's no mechanism to record who actually showed up.

---

## 3. Feature Description

### 3.1 Native Registration

When a public event is confirmed, the system exposes a registration API for that event. Parents register through the League's website by providing:

- **Guardian information:** name, email, phone number
- **Child information (one or more):** name, age
- **Role:** attending (default) or volunteering

Each registration creates one guardian record linked to one or more child records. The unit of capacity is kids — guardians don't count toward the event cap.

Adults who want to volunteer register themselves with the volunteer role. They don't need to list a child. Volunteers also don't count toward the event cap.

### 3.2 Unified Capacity Tracking

Each event has a fixed capacity (number of kids). The system computes available slots by combining registrations from both sources:

**Native registrations:** Count of children across all registrations. Straightforward — the data is structured.

**Meetup RSVPs:** The system periodically pulls RSVP data from the Meetup API. For each RSVP:

- Guest count of 1 → 1 kid (assume the person is a parent bringing one child, or a child attending)
- Guest count of 2+ → subtract 1 (the adult), remainder are kids

This heuristic slightly overcounts in the case of an adult attending alone with no child (rare for kids' coding events, and those adults are redirected to volunteer or observe). It undercounts in the edge case of two parents attending with one child. The tradeoff is acceptable.

**Combined count:**

```
kids_registered_native + kids_estimated_meetup = total_kids
event_capacity - total_kids = slots_remaining
```

When `slots_remaining` hits zero, the native registration form shows the event as full and offers a waitlist.

The system programmatically adjusts the Meetup event's RSVP limit to stay in sync. After computing `slots_remaining` (in kids), the system converts back to a Meetup guest limit by adding an estimated adult count (one adult per remaining kid slot), then updates the Meetup event via API. This prevents over-registration across channels without manual intervention.

### 3.3 Registration Digest Updates

The existing registration digest emails (spec §2.1, §3.4) are extended to include the combined count:

- Native registrations: exact count with names
- Meetup RSVPs: estimated kid count with the heuristic applied
- Combined total and remaining capacity

### 3.4 Attendance Reconciliation

After an event, an instructor or admin can open a reconciliation view for the event. This shows:

- All native registrations (guardian + children)
- Meetup RSVPs (by name, where available from the API)

For each registered child, the instructor marks: **showed up** or **no-show**. At the bottom, there's a field for **additional kids** — a count of children who attended but weren't on any registration list (walk-ins, last-minute additions).

This is a rough-count tool, not a strict check-in system. The instructor fills it out after the event (or during downtime), not at the door. The primary goal is getting an accurate attendance number for reporting.

**Output:**

```
confirmed_attendees = marked_as_showed_up + additional_kids
no_shows = marked_as_no_show
attendance_rate = confirmed_attendees / total_registered
```

### 3.5 Website Integration (Astro Component)

The League's website (jointheleague.org) is an Astro site. Each recurring event type has a persistent page. The registration system provides a JSON API, and the Astro site includes a component on these pages that calls the API and renders the appropriate UI.

The component has three states:

**Event scheduled, registration open:**
Shows event details (date, time, location), remaining capacity, and the registration form. If a Meetup event also exists, includes a link to the Meetup page. This is the primary registration path.

**Event scheduled, registration full:**
Shows event details with a "full" indicator and a waitlist signup form. Links to Meetup page if one exists.

**No event scheduled:**
Shows a prompt to request this event for your group, linking into the existing request intake flow from the spec (§3.1). This replaces or supplements whatever the page currently shows when no Meetup is scheduled.

The Astro component owns all rendering and styling. The registration system is a headless API — it returns data, not HTML. This keeps the look and feel consistent with the rest of jointheleague.org.

---

## 4. Interaction with Existing Spec

### 4.1 Changes to Event Types (§2.1)

The spec currently defines public events as "Registration via Meetup." This feature makes Meetup one of two registration channels for public events, not the sole channel. The native registration path runs in parallel.

Private events are unaffected. They already use the system's own registration links.

### 4.2 Changes to Registration Flow: Public Events (§3.4)

Steps 1–2 remain the same (Meetup event creation, external registration URL support). The following is added:

- The system also activates its native registration endpoint for the event.
- The Astro component on jointheleague.org displays the registration form.
- RSVP sync from Meetup now feeds into the unified capacity calculation rather than being a standalone tracking number.

### 4.3 Changes to Data Model

**New: Native Registration (replaces §5.6 for public events)**

The existing Registration/Interest model (§5.6) is designed for private event date voting. Native registration for public events is a different shape:

- `registration_id`
- `request_id` — FK to the parent event request
- `guardian_name`, `guardian_email`, `guardian_phone`
- `role` — attendee (default) or volunteer
- `children[]` — array of child records, each with `name` and `age`
- `source` — native or meetup (for records created from Meetup sync)
- `checked_in` — null (not yet reconciled), true, false
- `created_at`

**New: Attendance Reconciliation**

- `reconciliation_id`
- `request_id`
- `reconciled_by` — pike13_user_id of the instructor/admin
- `additional_kids` — count of walk-ins not on any list
- `reconciled_at`

**Modified: Event Request (§5.5)**

Add:

- `event_capacity` — maximum number of kids
- `native_registration_enabled` — boolean (could default to true for public events)

### 4.4 Changes to Integrations (§4.1)

Meetup integration gains two write components: (1) the system updates the Meetup event description to include a link to the native registration page on jointheleague.org, making the League's site the primary registration path while Meetup serves as discovery; (2) the system programmatically adjusts the Meetup event's RSVP limit as native registrations come in, keeping combined capacity in sync across both channels.

### 4.5 Changes to Phasing (§9)

This feature spans Phase 2 (registration) and would be implemented as:

- Phase 2a: Native registration API, registration form, unified capacity tracking
- Phase 2b: Astro component integration, Meetup cross-linking
- Phase 2c: Attendance reconciliation

---

## 5. API Sketch

The registration system exposes these endpoints for the Astro component:

### `GET /api/events/{class_slug}/current`

Returns the current or next scheduled event for a given class, if any. Used by the Astro component to determine which state to render.

Response includes: event status, date, time, location, capacity, slots remaining, Meetup URL (if any), registration open/closed.

Returns 404 or empty if no event is scheduled — the component falls back to the "request an event" state.

### `POST /api/events/{request_id}/register`

Accepts a native registration: guardian info, children, role.

Returns the created registration or a capacity error if full.

### `GET /api/events/{request_id}/registrations`

Authenticated (instructor/admin). Returns all registrations (native + Meetup-sourced) for an event, with check-in status.

### `POST /api/events/{request_id}/reconcile`

Authenticated (instructor/admin). Accepts attendance marks for each registration and the additional kids count.

---

## 6. Resolved Decisions

**Waitlist.** Yes. When native registration is full, the system offers a waitlist. This connects to Meetup's waitlist functionality where applicable.

**Meetup capacity coordination.** The system programmatically adjusts the Meetup event's RSVP limit via API. The calculation works in reverse from the unified capacity model: starting from the event's total kid capacity, subtract native registrations, then convert the remaining kid slots back into a Meetup guest limit by adding back an estimated adult count (since Meetup's limit applies to total guests, not just kids). This keeps the two channels in sync automatically rather than requiring manual admin intervention.

**Duplicate detection.** Best-effort name matching across native registrations and Meetup RSVPs. If a child's name from a native registration matches a Meetup RSVP name, the system flags it as a likely duplicate and doesn't double-count. This won't catch every case — people use different names or handles across platforms — but it's better than nothing. Meetup's API may not expose emails, so name is the primary matching field.

**Volunteer notifications.** Volunteers receive different communications than attending families — different arrival time, role expectations, what to bring, etc. The details of those notification templates are deferred to implementation.

**Data retention.** Registration data is retained indefinitely. Children's names are collected but their visibility is limited — the parent/guardian is the primary record in most contexts. Formal privacy policy language is deferred.

---

## 7. Open Questions

**Meetup RSVP heuristic accuracy.** The "subtract one adult" rule is the default. Should the system allow admins to override the estimated kid count for individual Meetup RSVPs if they know the actual breakdown?