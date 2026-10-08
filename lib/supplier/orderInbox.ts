import type { IncomingOrder, SupplierOrderStatus } from '@/models/procurement';

export interface InboxSection {
  status: SupplierOrderStatus;
  title: string;
  orders: IncomingOrder[];
}

/** What each stage asks of the store, in the order a supplier works through them. */
const SECTIONS: { status: SupplierOrderStatus; title: string }[] = [
  { status: 'CONFIRMED', title: 'New orders to start' },
  { status: 'PREPARING', title: 'Packing' },
  { status: 'READY_FOR_PICKUP', title: 'Waiting for rider' },
  { status: 'OUT_FOR_DELIVERY', title: 'Out for delivery' },
];

/**
 * The supplier Home's orders as an action inbox: one section per stage that needs the store, newest first within it,
 * empty sections left out. Finished orders are not in any section (they sit behind "See all orders").
 */
export function orderInbox(orders: readonly IncomingOrder[]): InboxSection[] {
  const newestFirst = (a: IncomingOrder, b: IncomingOrder) => Date.parse(b.createdAt) - Date.parse(a.createdAt);
  return SECTIONS
    .map(({ status, title }) => ({
      status, title, orders: orders.filter((order) => order.status === status).sort(newestFirst),
    }))
    .filter((section) => section.orders.length > 0);
}
