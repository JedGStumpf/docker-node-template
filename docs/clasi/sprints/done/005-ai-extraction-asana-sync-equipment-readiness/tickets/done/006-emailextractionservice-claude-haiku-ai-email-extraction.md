---
id: "006"
title: "EmailExtractionService: Claude Haiku AI email extraction"
status: done
use-cases:
  - SUC-001
  - SUC-002
depends-on:
  - "001"
github-issue: ""
todo: ""
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# EmailExtractionService: Claude Haiku AI email extraction

## Description

Implement `EmailExtractionService` at `server/src/services/email-extraction.service.ts`.

### Core method: `extractFromEmail(emailId: string, requestId: string, emailBody: string): Promise<EmailExtraction | null>`

1. If `ANTHROPIC_API_KEY` is not set: log a warning, return null (graceful degradation — no extraction attempted).
2. Call Claude Haiku (via `@anthropic-ai/sdk`) with a structured prompt:
   - System: "You are an extraction assistant for a community event coordination system. Extract the following fields from the email body as JSON."
   - Prompt includes: `status_signal` (one of: "confirmed", "cancelled", "rescheduled", "none"), `action_items` (array of strings, max 5), `host_registration_count` (integer or null).
3. Parse the JSON response. If parsing fails: log the error, return null.
4. Store the result in the `EmailExtraction` Prisma model.
5. Return the stored record.

### Integration with email ingestion
- `EmailService` (or the SES inbound handler) calls `extractionService.extractFromEmail(...)` asynchronously after storing the raw email. Fire-and-forget: the call is wrapped in a `.catch(err => logger.error(...))`.

### Admin UI extension
- Add `emailExtractions` to the admin request detail API response: `GET /api/admin/requests/:id` includes the latest extraction (if any) with all fields.
- Add an "Apply signal" action: `POST /api/admin/requests/:id/apply-extraction/:extractionId` — applies the `statusSignal` to the `EventRequest.status`. Records `appliedAt` on the extraction. Logs the state change with `source = "email_extraction"`.

### npm dependency
- Add `@anthropic-ai/sdk` to `server/package.json`.

### ServiceRegistry
- Add `emailExtraction: EmailExtractionService` instantiated with `defaultPrisma`.
- In `test` environment: use a `MockEmailExtractionService` (or inject a mock Anthropic client) that returns a fixed extraction response without making real API calls.

### Environment variable
- `ANTHROPIC_API_KEY` — existing key (used by the template's AI features). Optional; if not set, extraction degrades gracefully.

## Acceptance Criteria

- [x] `extractFromEmail()` stores an `EmailExtraction` record when `ANTHROPIC_API_KEY` is set (mock in tests).
- [x] `extractFromEmail()` returns null gracefully when `ANTHROPIC_API_KEY` is not set.
- [x] Admin request detail API includes the latest extraction.
- [x] `POST /api/admin/requests/:id/apply-extraction/:extractionId` transitions request status and sets `appliedAt`.
- [x] Apply-extraction endpoint returns 403 for non-admin callers.
- [x] Extraction failure (API error, JSON parse error) does not affect email storage.
- [x] `npm run test:server` passes green.

## Testing

- **Existing tests to run**: `npm run test:server`
- **New tests to write**:
  - `tests/server/email-extraction.service.test.ts` — unit tests using a mock Anthropic client that returns fixed JSON. Test all paths: success, API key missing, bad JSON response.
  - `tests/server/email-extraction.routes.test.ts` — integration tests for admin detail API (extraction present) and apply-extraction endpoint.
- **Verification command**: `npm run test:server`
