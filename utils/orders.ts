import type { SupplierOrderItem } from '@/models/procurement';
import type { Money } from '@/utils/money';

/**
 * How many names fit on one line of a card at phone width before the rest has
 * to become a count. Three is a measured compromise, not a guess: at 390pt with
 * the caption style, three short names and a "+n" fill the line and a fourth
 * truncates mid-word, which reads worse than an honest overflow count.
 */
export const ITEM_NAMES_SHOWN = 3;

/**
 * The goods on an order, as one line.
 *
 * <p>"3 items" tells a supplier nothing they can act on — they are deciding
 * whether they have the stock, and that decision is about *which* goods. So the
 * names lead, and the count only appears for what did not fit.
 *
 * <p>The overflow is the number **hidden**, not the total: six items shown three
 * at a time reads "+3", because the reader can already see the first three.
 */
export function summariseItems(
  items: Pick<SupplierOrderItem, 'skuName' | 'productName'>[],
  max: number = ITEM_NAMES_SHOWN,
): string {
  // The SKU name is the supplier's own wording and the one they recognise on a
  // shelf; the canonical name is the fallback when a SKU was never named.
  const names = items
    .map((item) => item.skuName || item.productName)
    .filter((name): name is string => Boolean(name));

  if (names.length === 0) {
    const count = items.length;
    return `${count} item${count === 1 ? '' : 's'}`;
  }

  const shown = names.slice(0, max);
  const hidden = names.length - shown.length;
  return hidden > 0 ? `${shown.join(', ')} +${hidden}` : shown.join(', ');
}

/**
 * How the order was funded, in the words the card has room for.
 *
 * <p>"Prepaid" and "On credit" rather than the enum: the supplier is reading
 * whether the money is already secured or whether this one sits against a limit
 * they granted, and those are the two words they use for it.
 */
export function formatDistance(km: Money | number | null | undefined): string | null {
  // Absent means unlocated, not nearby. "0 km" would tell a supplier the order
  // is next door, which is the one wrong answer a guess can give here.
  if (km == null) return null;
  const value = typeof km === 'string' ? Number(km) : km;
  if (!Number.isFinite(value)) return null;
  // Under a kilometre, one decimal is noise; over it, it is the whole signal.
  return value < 1 ? `${Math.round(value * 1000)} m` : `${value.toFixed(1)} km`;
}

export function paymentMethodLabel(method: 'PREPAID' | 'CREDIT' | null): string | null {
  if (method === 'PREPAID') return 'Prepaid';
  if (method === 'CREDIT') return 'On credit';
  return null;
}

/**
 * The figure an order card should show.
 *
 * <p>`acceptedAmount` is what the supplier committed to, and it is the right
 * number the moment they have committed to anything — after a partial acceptance
 * it is the only honest one. But it is **zero on every order nobody accepted**,
 * so reading it unconditionally showed an expired ₹10,587.97 order as ₹0.00, as
 * if it had been worth nothing. It was worth exactly what was asked for; what it
 * never got was an answer.
 *
 * <p>So: the committed figure once there is a commitment, the requested figure
 * before and instead of one.
 */
const COMMITTED: ReadonlySet<string> = new Set([
  'CONFIRMED', 'PARTIALLY_ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED',
]);

export function orderValue(order: {
  status: string;
  totalAmount: Money;
  acceptedAmount?: Money | null;
}): Money {
  if (!COMMITTED.has(order.status) || order.acceptedAmount == null) {
    return order.totalAmount;
  }
  return order.acceptedAmount;
}
