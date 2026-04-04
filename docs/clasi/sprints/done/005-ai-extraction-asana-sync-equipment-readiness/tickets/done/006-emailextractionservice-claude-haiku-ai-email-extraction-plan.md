---
ticket: "006"
sprint: "005"
status: in-progress
---

# Plan: EmailExtractionService — Claude Haiku AI email extraction

## Approach

1. Install `@anthropic-ai/sdk` in server package.
2. Create `EmailExtractionService` with an injectable Anthropic client interface for testability.
3. Add to `ServiceRegistry` (real client in production, mock in tests).
4. Extend admin request detail API to include latest extraction.
5. Add apply-extraction route.
6. Write unit and integration tests.

## Files to create/change

- `server/src/services/email-extraction.service.ts` — new service
- `server/src/services/service.registry.ts` — add emailExtraction service
- `server/src/routes/admin/requests.ts` — extend detail API + apply-extraction route
- `tests/server/email-extraction.service.test.ts`
- `tests/server/email-extraction.routes.test.ts`
