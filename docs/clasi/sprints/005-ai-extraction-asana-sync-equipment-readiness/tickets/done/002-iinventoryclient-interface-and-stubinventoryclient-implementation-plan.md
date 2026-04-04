---
ticket: "002"
sprint: "005"
status: in-progress
---

# Plan: IInventoryClient interface and StubInventoryClient implementation

## Approach

1. Create `server/src/services/inventory/` directory with:
   - `inventory-client.interface.ts` — `CheckoutItem` type and `IInventoryClient` interface
   - `stub-inventory-client.ts` — `StubInventoryClient` with 3 modes via `INVENTORY_STUB_MODE`
   - `index.ts` — barrel export

2. Update `ServiceRegistry` to add `inventoryClient: IInventoryClient`.

3. Write unit tests at `tests/server/inventory-client.test.ts`.

## Files to create/change

- `server/src/services/inventory/inventory-client.interface.ts`
- `server/src/services/inventory/stub-inventory-client.ts`
- `server/src/services/inventory/index.ts`
- `server/src/services/service.registry.ts`
- `tests/server/inventory-client.test.ts`
