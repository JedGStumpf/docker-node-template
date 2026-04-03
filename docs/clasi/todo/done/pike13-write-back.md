---
status: done
sprint: '004'
---

# Pike13 Write-Back — Book Confirmed Instructor

When an event is confirmed and an instructor has accepted the assignment,
write back to Pike13 to book the instructor for that date/time. Requires
Pike13 API write scope and an understanding of Pike13's booking/appointment
creation endpoints.

Spec references: §3.5, §9 Phase 2.

Deferred from Sprint 3 because the Pike13 API write scope has not been
tested and the booking endpoint contract is unclear. The read-only
integration (availability, OAuth) is stable; write operations need a
separate spike.

## Notes

- Timing: book when request moves to `confirmed`, not when instructor
  accepts (acceptance predates date finalization).
- May require a new Pike13 API scope (`write:appointments` or similar).
- Must handle failures gracefully (log + notify admin if booking fails).
- Consider idempotency — don't double-book if finalization is retried.
