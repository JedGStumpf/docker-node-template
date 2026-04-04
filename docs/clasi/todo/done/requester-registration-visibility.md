---
status: done
sprint: '006'
---

# Requester Registration Visibility

The spec implies requesters can see registration progress ("registration
digest emails give both sides visibility"). Currently, the public event
page (`GET /api/events/:requestId?token=...`) shows vote tallies, but
the full registration list (`GET /api/events/:requestId/registrations`)
is restricted to admin/instructor.

Consider whether requesters should have a dedicated view showing
registrant names and counts, or if the public page tallies + digest
emails are sufficient.

## Notes

- Sprint 3 relies on the public event page tallies + digest emails for
  requester visibility. No separate authenticated view for requesters.
- If a dedicated view is needed later, the registration token could
  grant read-only access to the registrations endpoint.
- Alternatively, a "requester dashboard" could be a Sprint 4+ feature.
