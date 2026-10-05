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
