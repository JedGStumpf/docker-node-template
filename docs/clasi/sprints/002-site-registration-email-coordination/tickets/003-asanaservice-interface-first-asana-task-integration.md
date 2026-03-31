---
id: "003"
title: "AsanaService — interface-first Asana task integration"
status: todo
use-cases: [SUC-005]
depends-on: ["001"]
github-issue: ""
todo: ""
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# AsanaService — interface-first Asana task integration

## Description

Create `server/src/services/asana.service.ts` and `server/src/services/asana.client.ts` with an interface-first design so tests never make real HTTP calls.

**`IAsanaClient` interface** (`server/src/services/asana.client.ts`):
```ts
interface IAsanaClient {
  createTask(params: { name: string; notes: string; projectGid: string; assigneeGid?: string }): Promise<{ gid: string }>;
}
```

**`RealAsanaClient`** — implements `IAsanaClient` using the `asana` npm package. Reads `ASANA_ACCESS_TOKEN` from env.

**`AsanaService`** (`server/src/services/asana.service.ts`):
- Constructor accepts `IAsanaClient` (injected)
- `createRequestTask(request)` — builds task name and notes from request fields, calls `client.createTask` with `ASANA_PROJECT_GID` and optional `ASANA_ASSIGNEE_GID`. Returns `{ gid }` or `null` if `ASANA_PROJECT_GID` or `ASANA_ACCESS_TOKEN` is not set (graceful degradation — logs a warning).

**`ServiceRegistry`**: inject `RealAsanaClient` in production, a `MockAsanaClient` (returns fake GID) in test/dev.

Install the `asana` npm package in `server/`.

## Acceptance Criteria

- [ ] `IAsanaClient` interface defined and exported
- [ ] `RealAsanaClient` implements `IAsanaClient` using the `asana` npm SDK
- [ ] `AsanaService.createRequestTask` returns `null` (not throws) when `ASANA_PROJECT_GID` or `ASANA_ACCESS_TOKEN` is absent
- [ ] `ServiceRegistry` exposes `services.asana` (instance of `AsanaService`)
- [ ] Tests use a `MockAsanaClient` — no real Asana HTTP calls in test suite
- [ ] TypeScript compiles with no errors

## Testing

- **Existing tests to run**: `npm run test:server`
- **New tests to write**: `tests/server/asana-integration.test.ts` — test that `createRequestTask` stores the returned GID on the request, returns null gracefully when unconfigured, and that the mock client is used in tests
- **Verification command**: `npm run test:server`
