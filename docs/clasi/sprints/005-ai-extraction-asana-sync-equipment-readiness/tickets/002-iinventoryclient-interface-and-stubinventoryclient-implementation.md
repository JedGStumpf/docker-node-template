---
id: "002"
title: "IInventoryClient interface and StubInventoryClient implementation"
status: todo
use-cases:
  - SUC-005
  - SUC-006
depends-on:
  - "001"
github-issue: ""
todo: ""
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# IInventoryClient interface and StubInventoryClient implementation

## Description

Create the `IInventoryClient` interface and `StubInventoryClient` at `server/src/services/inventory/`. This is the foundation for `EquipmentService` (ticket 003).

### IInventoryClient interface (`inventory-client.interface.ts`)
```typescript
export interface CheckoutItem {
  item_type: string;
  quantity: number;
  due_date: string;
}

export interface IInventoryClient {
  getCheckouts(inventoryUserId: string): Promise<CheckoutItem[]>;
}
```

### StubInventoryClient (`stub-inventory-client.ts`)
- Implements `IInventoryClient`.
- Reads `INVENTORY_STUB_MODE` env var to return different mock responses:
  - `"ready"` — returns a full set of items matching a predefined fixture (instructor has everything).
  - `"pending"` (default) — returns a partial set (instructor is missing some items).
  - `"unknown"` / any value that would cause an exception — throws a simulated error so `EquipmentService` can test the unknown/degraded path.
- The fixture data should include at least: 1× EV3 Robot Kit (quantity 2 needed, 1 checked out) and 15× micro:bit (all checked out).

### ServiceRegistry
- Add `inventoryClient: IInventoryClient` property.
- In `test` and non-production environments: use `StubInventoryClient`.
- When `INVENTORY_API_KEY` is set in production: placeholder comment noting where the real client will be wired (real client is a follow-on task).
- For Sprint 5, always use `StubInventoryClient` regardless of environment.

## Acceptance Criteria

- [ ] `IInventoryClient` interface is exported from `server/src/services/inventory/index.ts`.
- [ ] `StubInventoryClient` returns correct fixture data for all three modes (`ready`, `pending`, error).
- [ ] `ServiceRegistry` exposes `inventoryClient` property.
- [ ] Unit tests for `StubInventoryClient` cover all three modes.
- [ ] `npm run test:server` passes green.

## Testing

- **Existing tests to run**: `npm run test:server`
- **New tests to write**: `tests/server/inventory-client.test.ts` — unit test for all three stub modes.
- **Verification command**: `npm run test:server`
