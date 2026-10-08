import type { IncomingOrder } from '@/models/procurement';

export interface InboxSection {
  key: string;
  title: string;
  orders: IncomingOrder[];
}

interface SectionDef {
  key: string;
  title: string;
  matches: (order: IncomingOrder) => boolean;
}

const READY_MODES = new Set(['SUPPLIER_DELIVERY', 'COSTONOMY_DELIVERY', 'PICKUP']);
const at = (status: string) => (order: IncomingOrder) => order.status === status;
const readyFor = (mode: string) => (order: IncomingOrder) =>
  order.status === 'READY_FOR_PICKUP' && order.deliveryMode === mode;

/**
 * What each stage asks of the store, in the order a supplier works through them. A Ready order means three different
 * things by delivery mode: the supplier's own van is theirs to send out (an action), a Costonomy rider is awaited, and a
 * collecting restaurant is awaited too. "Ready to send out" sits above the waiting sections because it is the only
 * Ready state that needs the store to do something.
 */
const SECTIONS: SectionDef[] = [
  { key: 'CONFIRMED', title: 'New orders to start', matches: at('CONFIRMED') },
  { key: 'PREPARING', title: 'Packing', matches: at('PREPARING') },
  { key: 'READY_SEND', title: 'Ready to send out', matches: readyFor('SUPPLIER_DELIVERY') },
  { key: 'READY_RIDER', title: 'Waiting for rider', matches: readyFor('COSTONOMY_DELIVERY') },
  { key: 'READY_PICKUP', title: 'Waiting for pickup', matches: readyFor('PICKUP') },
  // A Ready order whose mode the list did not say: still shown, but not claimed to be waiting on anyone in particular.
  { key: 'READY_OTHER', title: 'Ready', matches: (order) => order.status === 'READY_FOR_PICKUP' && !READY_MODES.has(String(order.deliveryMode)) },
  { key: 'OUT_FOR_DELIVERY', title: 'Out for delivery', matches: at('OUT_FOR_DELIVERY') },
];

/** Orders that are finished or never reached the store: they sit behind "See all orders", not in the inbox. */
const NOT_IN_INBOX = new Set(['DRAFT', 'DELIVERED', 'COMPLETED', 'CANCELLED']);

/**
 * The supplier Home's orders as an action inbox: one section per stage that needs the store, newest first within it,
 * empty sections left out. Finished orders are not in any section (they sit behind "See all orders"). An order in a
 * status this build does not know lands in a final
 * "Other" section so it can never be unreachable from Home.
 */
export function orderInbox(orders: readonly IncomingOrder[]): InboxSection[] {
  const newestFirst = (a: IncomingOrder, b: IncomingOrder) => Date.parse(b.createdAt) - Date.parse(a.createdAt);
  const placed = new Set<IncomingOrder>();
  const sections = SECTIONS.map(({ key, title, matches }) => {
    const inSection = orders.filter(matches).sort(newestFirst);
    inSection.forEach((order) => placed.add(order));
    return { key, title, orders: inSection };
  });
  const other = orders.filter((order) => !placed.has(order) && !NOT_IN_INBOX.has(order.status)).sort(newestFirst);
  return [...sections, { key: 'OTHER', title: 'Other', orders: other }].filter((section) => section.orders.length > 0);
}
