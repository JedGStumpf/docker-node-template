export interface CheckoutItem {
  item_type: string;
  quantity: number;
  due_date: string;
}

export interface IInventoryClient {
  getCheckouts(inventoryUserId: string): Promise<CheckoutItem[]>;
}
