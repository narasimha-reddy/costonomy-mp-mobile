import type { Money } from '@/utils/money';
import type { SupplierOrder, SupplierOrderItem, SupplierOrderStatus } from '@/models/procurement';
import { formatMoney, formatQuantity } from '@/utils/money';

/**
 * The supplier's side of catch-weight (API D-128), decided here so the screen only renders.
 *
 * <p>The server owns the rules and the arithmetic: the allowed band, the decimals, which quantity is billed, the
 * money. Nothing here recomputes any of it. This module only decides what to *show* from fields the server sent, and
 * refuses what the server would refuse for a reason the screen can see without a number: an empty field.
 *
 * <p>Money and quantities arrive as JSON numbers although the models say strings, so nothing here calls a string
 * method on them.
 */

/** The API refuses weighing from READY (`SupplierOrderService`), so the screen offers it only before. */
export function canWeigh(status: SupplierOrderStatus): boolean {
  return status === 'CONFIRMED' || status === 'PREPARING';
}

/** What a field says when nothing was entered. The server says the same for a blank reading. */
export const WEIGHT_REQUIRED = 'Enter the weight shown on the scale.';

/**
 * The sentence the server refuses "Mark ready" with while a catch-weight line is unweighed
 * (`SupplierOrderTransitions`). Shown before the tap so the button is not a trap, and the server's own message is still
 * what appears if it refuses.
 */
export const WEIGH_BEFORE_READY = 'Weigh every catch-weight line before marking the order ready.';

/** Lines sold by weight that the supplier is supplying. */
export function catchWeightLines(order: Pick<SupplierOrder, 'items'> | undefined | null): SupplierOrderItem[] {
  return (order?.items ?? []).filter((item) => item.isCatchWeight && Number(item.acceptedQuantity ?? 0) > 0);
}

/** Catch-weight lines still to be weighed. */
export function unweighedLines(order: Pick<SupplierOrder, 'items'> | undefined | null): SupplierOrderItem[] {
  return catchWeightLines(order).filter((item) => item.dispatchedWeight == null);
}

/** Why "Mark ready" cannot be used yet, or null. */
export function readyBlockedMessage(order: Pick<SupplierOrder, 'items' | 'status'>): string | null {
  return order.status === 'PREPARING' && unweighedLines(order).length > 0 ? WEIGH_BEFORE_READY : null;
}

/**
 * What the fields start as: empty, or the reading already taken when re-weighing. Never the accepted quantity: a
 * prefilled field is a reading nobody took.
 */
export function initialWeights(items: SupplierOrderItem[]): Record<number, string> {
  const drafts: Record<number, string> = {};
  for (const item of items) {
    drafts[item.id] = item.dispatchedWeight == null ? '' : String(item.dispatchedWeight);
  }
  return drafts;
}

export type WeighPayload =
  | { ok: true; weights: { supplierOrderItemId: number; dispatchedWeight: string }[] }
  | { ok: false; message: string };

/** Every line, as typed. An empty field is refused here; anything else is the server's to judge. */
export function buildWeighPayload(items: SupplierOrderItem[], drafts: Record<number, string>): WeighPayload {
  const weights: { supplierOrderItemId: number; dispatchedWeight: string }[] = [];
  for (const item of items) {
    const typed = (drafts[item.id] ?? '').trim();
    if (typed === '') return { ok: false, message: WEIGHT_REQUIRED };
    weights.push({ supplierOrderItemId: item.id, dispatchedWeight: typed });
  }
  return { ok: true, weights };
}

/** "Scale 9.6 KG · billed 9.6 KG": the reading beside what is billed, both from the server. */
export function weighedLine(item: SupplierOrderItem): string | null {
  if (item.dispatchedWeight == null) return null;
  const scale = formatQuantity(item.dispatchedWeight, item.unit);
  return item.billableQuantity == null
    ? `Scale ${scale}`
    : `Scale ${scale} · billed ${formatQuantity(item.billableQuantity, item.unit)}`;
}

/**
 * The order-level weight adjustment, as the server defines it: positive is a refund to the buyer (they pay less),
 * negative an extra charge. Since D-128 the buyer is billed at most what was accepted, so negative only survives in old
 * data. Null when there is nothing to say.
 */
export function weightAdjustmentCopy(amount: Money | number | null | undefined): { text: string; refund: boolean } | null {
  if (amount == null) return null;
  const value = Number(amount);
  if (!Number.isFinite(value) || value === 0) return null;
  const shown = formatMoney(Math.abs(value).toFixed(2));
  return value > 0
    ? { text: `Weighed less: the buyer pays ${shown} less`, refund: true }
    : { text: `The buyer pays ${shown} more`, refund: false };
}
