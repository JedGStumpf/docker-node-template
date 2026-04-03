import type { CheckoutItem, IInventoryClient } from './inventory-client.interface';

/**
 * Stub inventory client for development and testing.
 * Controlled by INVENTORY_STUB_MODE environment variable:
 *   "ready"   — instructor has all required equipment checked out
 *   "pending" — instructor is missing some equipment (default)
 *   "error"   — simulates an API failure so EquipmentService returns "unknown"
 */
export class StubInventoryClient implements IInventoryClient {
  async getCheckouts(inventoryUserId: string): Promise<CheckoutItem[]> {
    const mode = process.env.INVENTORY_STUB_MODE ?? 'pending';

    if (mode === 'error') {
      throw new Error(`StubInventoryClient: simulated error for user ${inventoryUserId}`);
    }

    if (mode === 'ready') {
      // Instructor has everything: 2 EV3 Robot Kits and 15 micro:bits
      return [
        { item_type: 'EV3 Robot Kit', quantity: 2, due_date: '2026-05-01' },
        { item_type: 'micro:bit', quantity: 15, due_date: '2026-05-01' },
      ];
    }

    // Default: "pending" — instructor has 1 of 2 EV3 kits and all micro:bits
    return [
      { item_type: 'EV3 Robot Kit', quantity: 1, due_date: '2026-05-01' },
      { item_type: 'micro:bit', quantity: 15, due_date: '2026-05-01' },
    ];
  }
}
