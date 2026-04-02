---
status: pending
---

# Waitlist When Registration is Full

After a date is finalized and confirmed, additional registrations should
go onto a waitlist rather than being rejected. If a confirmed registrant
cancels, the next waitlisted person is promoted.

Spec references: FEAT-1 §3.1.

Deferred from Sprint 3 — FEAT-1 native registration feature (Sprint 4)
will bring the broader registration capacity model. For Sprint 3, once
a date is finalized the registration endpoint returns 422 for new
registrations.

## Notes

- New `Registration.status` value: `waitlisted`.
- Promotion logic when a confirmed registrant cancels.
- Notification to promoted registrant with updated iCal.
- Admin can manually promote/remove from waitlist.
