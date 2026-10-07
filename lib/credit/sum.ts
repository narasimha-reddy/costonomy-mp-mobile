import { scaledToAmount, toScaled } from '@/lib/wallet/amount';
import type { Money } from '@/utils/money';

/**
 * The sum of server amounts, for display beside a "Pay" button only.
 *
 * <p>Added as integers (ten-thousandths of a rupee), never as floats, so
 * 0.1 + 0.2 is 0.30 and not 0.30000000000000004. The result is the two-decimal
 * string the API and `formatMoney` take. It is never sent: each supplier is
 * paid the amount the server gave for that supplier.
 *
 * @returns "0.00" for no amounts; null if any amount is not a plain non-negative decimal.
 */
export function sumAmounts(values: readonly (Money | number)[]): string | null {
  let total = 0;
  for (const value of values) {
    const scaled = toScaled(value, 4);
    if (scaled == null) return null;
    total += scaled;
  }
  return scaledToAmount(total);
}

/**
 * `a - b` as the two-decimal string, for display beside a hint only (never sent).
 *
 * <p>Integers (ten-thousandths of a rupee), never floats.
 *
 * @returns null if either is not a plain non-negative decimal, or if `b` is more than `a`.
 */
export function differenceAmounts(a: Money | number, b: Money | number): string | null {
  const x = toScaled(a, 4);
  const y = toScaled(b, 4);
  if (x == null || y == null || y > x) return null;
  return scaledToAmount(x - y);
}

/**
 * How much of `due` a payment of `typed` would leave owed, when that is a sliver:
 * more than nothing but less than ₹1. The server will not take a part payment
 * under ₹1 later (it only accepts one that clears everything), so a payment that
 * leaves such a sliver strands it.
 *
 * @returns the sliver as a two-decimal string, or null when it is not a sliver.
 */
export function sliverLeft(due: Money | number, typed: Money | number): string | null {
  const d = toScaled(due, 4);
  const t = toScaled(typed, 4);
  if (d == null || t == null || t >= d) return null;
  const left = d - t;
  return left < 10_000 ? scaledToAmount(left) : null;
}

/** Whether two server/typed amounts are exactly equal, as integers. */
export function sameAmount(a: Money | number | null | undefined, b: Money | number | null | undefined): boolean {
  if (a == null || b == null) return false;
  const x = toScaled(a, 4);
  const y = toScaled(b, 4);
  return x != null && y != null && x === y;
}
