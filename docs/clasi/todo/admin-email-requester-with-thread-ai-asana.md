---
status: pending
---

# Admin: Email Requester with Thread, AI Extraction, and Asana Sync

The admin request detail page needs an "Email Requester" action so admins
can communicate directly with the person who submitted a request. This
feature must be fully integrated with the existing email thread, AI
extraction, and Asana sync pipeline established in sprints 4–5.

## Description

When an admin sends a message to a requester, it should:

1. **Use the existing email thread** — send via the request's assigned
   `emailThreadAddress` (or create one if not yet assigned), so all
   correspondence is threaded.
2. **Queue through the email queue** — use the `EmailQueue` model and
   existing email service so delivery is reliable and retryable.
3. **Trigger AI extraction** — inbound replies from the requester should
   be processed by the AI extraction pipeline (`EmailExtraction` model)
   to automatically detect dates, headcounts, confirmations, or other
   signals and surface them on the request detail page.
4. **Sync to Asana** — status changes or key signals extracted from
   replies should update the linked Asana task (`asanaTaskId`) via the
   existing Asana sync.

## UI

- "Email Requester" button on `AdminRequestDetail` opens a compose area
  (subject pre-filled from request context, body editable).
- Sent messages and inbound replies visible in a thread view on the
  detail page.

## Notes

- The email thread infrastructure already exists from sprint 4.
- AI extraction (`EmailExtraction`) and Asana sync already exist from
  sprint 5.
- This TODO connects the outbound admin → requester path that was
  deferred in those sprints.
- Inbound reply handling requires a webhook or polling mechanism to
  receive replies and feed them into the extraction pipeline.
