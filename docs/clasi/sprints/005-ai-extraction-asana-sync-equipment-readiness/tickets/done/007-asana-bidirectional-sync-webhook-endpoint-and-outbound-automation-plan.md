---
ticket: "007"
sprint: "005"
status: in-progress
---

# Plan: Asana bidirectional sync

## Approach

1. Create `AsanaWebhookService` for handling inbound webhook events.
2. Add webhook route `POST /api/webhooks/asana`.
3. Extend `AsanaService.pushExtractionUpdate()` for outbound comments.
4. Wire `EmailExtractionService` to call `pushExtractionUpdate()` after storing extraction.
5. Add to `ServiceRegistry`.
6. Write tests.

## Files to create/change

- `server/src/services/asana-webhook.service.ts` — new service
- `server/src/services/asana.service.ts` — add pushExtractionUpdate
- `server/src/services/asana.client.ts` — add addComment method
- `server/src/services/email-extraction.service.ts` — call pushExtractionUpdate
- `server/src/services/service.registry.ts` — add asanaWebhook service
- `server/src/routes/webhooks.ts` (or similar) — webhook route
- `server/src/app.ts` — register webhook route
- `tests/server/asana-webhook.test.ts`
- `tests/server/asana-outbound.test.ts`
