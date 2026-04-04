import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StubInventoryClient } from '../../server/src/services/inventory';

describe('StubInventoryClient', () => {
  const originalMode = process.env.INVENTORY_STUB_MODE;

  afterEach(() => {
    if (originalMode === undefined) {
      delete process.env.INVENTORY_STUB_MODE;
    } else {
      process.env.INVENTORY_STUB_MODE = originalMode;
    }
  });

  it('returns full checkout set in "ready" mode', async () => {
    process.env.INVENTORY_STUB_MODE = 'ready';
    const client = new StubInventoryClient();
    const items = await client.getCheckouts('user-123');
    expect(items).toHaveLength(2);
    const ev3 = items.find((i) => i.item_type === 'EV3 Robot Kit');
    expect(ev3?.quantity).toBe(2);
    const microbit = items.find((i) => i.item_type === 'micro:bit');
    expect(microbit?.quantity).toBe(15);
  });

  it('returns partial checkout set in "pending" mode (default)', async () => {
    delete process.env.INVENTORY_STUB_MODE;
    const client = new StubInventoryClient();
    const items = await client.getCheckouts('user-123');
    expect(items).toHaveLength(2);
    const ev3 = items.find((i) => i.item_type === 'EV3 Robot Kit');
    // Only 1 of the 2 required kits checked out
    expect(ev3?.quantity).toBe(1);
  });

  it('throws an error in "error" mode', async () => {
    process.env.INVENTORY_STUB_MODE = 'error';
    const client = new StubInventoryClient();
    await expect(client.getCheckouts('user-123')).rejects.toThrow('simulated error');
  });
});
