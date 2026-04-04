---
id: "007"
title: "Asana bidirectional sync: webhook endpoint and outbound automation"
status: done
use-cases:
  - SUC-003
  - SUC-004
depends-on:
  - "006"
github-issue: ""
todo: ""
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Asana bidirectional sync: webhook endpoint and outbound automation

## Description

Implement Asana bidirectional sync. Sprint 2 created Asana tasks on request verification (outbound only). This ticket adds:

1. **Inbound: `POST /api/webhooks/asana`** — receives Asana webhook events and maps them to `EventRequest` status.
2. **`AsanaWebhookService`** — logic for handling Asana events.
3. **Outbound automation** — extend `AsanaService` to push updates from email extractions.

### `AsanaWebhookService` (`server/src/services/asana-webhook.service.ts`)

**Handshake handling:**
- On first contact, Asana sends a POST with `X-Hook-Secret` header and no events.
- Endpoint echoes the header value back as `X-Hook-Secret` response header and returns 200.
- The secret is stored in a config key (via `setConfig("asana_webhook_secret", ...)`) so subsequent requests can be verified.

**Event handling:**
- Subsequent POST bodies contain `{ events: [{ resource: { gid }, type, action }] }`.
- For each event: look up the `EventRequest` where `asanaTaskId = resource.gid`.
- Map event type/action to `EventRequest` status:
  - `task` / `completed` → if request is `discussing` or `confirmed`, transition to `completed`.
  - `task` / `deleted` → log and ignore (do not modify request).
  - `task` / `changed` (section change) → log for admin review (emit SSE event to admin dashboard).
- Unknown event types: log and return 200 (do not 500).

**Signature verification (stretch):**
- If `ASANA_WEBHOOK_SECRET` env var is set, verify `X-Hook-Signature` HMAC on incoming requests. If not set, skip verification (for local dev).

### Outbound: `AsanaService` extensions

Add `pushExtractionUpdate(requestId: string, extraction: EmailExtraction): Promise<void>`:
1. Look up `asanaTaskId` on the `EventRequest`.
2. If no task ID: log and return.
3. Format a comment: "AI extraction from email — Status signal: [signal]. Action items: [list]."
4. POST the comment to the Asana task comments API.
5. If `statusSignal` is `"confirmed"` or `"cancelled"`: also move the task to the appropriate Asana section/status.
6. Graceful degradation: if `ASANA_ACCESS_TOKEN` is not set, return without error.

Called from `EmailExtractionService` after storing the extraction (fire-and-forget).

### New env vars
- `ASANA_WEBHOOK_SECRET` — optional, for verifying Asana webhook signatures.

## Acceptance Criteria

- [x] `POST /api/webhooks/asana` echoes `X-Hook-Secret` on handshake and returns 200.
- [x] A task-completed webhook event transitions the corresponding `EventRequest`.
- [x] Unknown event types return 200 without erroring.
- [x] `AsanaService.pushExtractionUpdate()` posts a comment with extraction summary to the Asana task.
- [x] Extraction update is skipped gracefully when `ASANA_ACCESS_TOKEN` is not set.
- [x] `POST /api/webhooks/asana` returns 200 for all valid payloads (no 500s on unexpected input).
- [x] `npm run test:server` passes green.

## Testing

- **Existing tests to run**: `npm run test:server`
- **New tests to write**:
  - `tests/server/asana-webhook.test.ts` — POST synthetic payloads (handshake, task-completed, unknown type). Assert `EventRequest` transitions and 200 responses.
  - `tests/server/asana-outbound.test.ts` — Call `pushExtractionUpdate()` with a mock Asana client. Assert comment was posted.
- **Verification command**: `npm run test:server`
