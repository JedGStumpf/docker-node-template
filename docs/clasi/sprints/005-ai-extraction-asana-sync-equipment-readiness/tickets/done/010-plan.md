# Ticket 010 Plan: Edge Cases

## 1. Late Participant Additions

**Schema**: Add `confirmedDate DateTime?` to `EventRequest` (if not already present). Add `giveLivelyUrl String?` to `EventRequest`.

**RegistrationService**: In `createRegistration()`, check if `request.status === 'confirmed'` and skip date voting. Capacity/waitlist logic still applies.

**Admin route**: `POST /api/admin/requests/:id/registrations` — admin manually adds a registration.

## 2. No-Instructor-Available Workflow

**Schema**: Allow `"no_instructor"` as a valid EventRequest status value (string field, no enum constraint in Prisma).

**InstructorService**: After all instructors decline or time out in the notification cycle, call a new `handleNoInstructorAvailable(requestId)` method that:
- Updates request status to `"no_instructor"`
- Sends admin alert email via EmailService

**Admin API**: `POST /api/admin/requests/:id/reopen-matching` — resets status to `"discussing"` and re-notifies available instructors.

**Admin UI**: Show `"no_instructor"` badge in AdminRequests list and AdminRequestDetail. Add "Re-open matching" button.

## 3. Meetup Group Mapping Fallback Logging

**MeetupService**: In `createMeetupEvent()`, when no group mapping is found:
- Log structured warning with `classSlug` and `fallback`
- Include fallback group name in event description

**Admin analytics**: Add fallback warning list (read from logs or a DB table).

Since logs aren't easily queryable, store fallback events in a simple `MeetupFallback` tracking approach — actually, for simplicity log to console.warn with structured JSON and skip a new DB model (keeping schema changes minimal).

## 4. Give Lively Donation Link

**Schema**: `giveLivelyUrl String?` on `EventRequest`.

**Migration**: Add to the existing migration or a new one.

**Admin API**: `PATCH /api/admin/requests/:id` accepts `giveLivelyUrl`, validates URL starts with `https://`.

**Public event page**: Render donation link if present.

**Email templates**: Include link in confirmation emails when set.

## Implementation Order

1. Schema + migration (giveLivelyUrl, confirmedDate if missing)
2. SQLite push
3. RegistrationService late registration logic
4. InstructorService no-instructor workflow + EmailService alert
5. Admin routes (reopen-matching, manual registration, giveLivelyUrl patch)
6. Admin UI badge + button
7. Public EventPage donation link
8. Tests
