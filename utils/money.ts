/**
 * Money formatting.
 *
 * **This module formats. It never calculates.** PRD §23A.51 and guardrail 3
 * ("never trust mobile financial values") mean every rupee figure the app shows
 * — line totals, GST, delivery, order totals, commission, credit balances — is
 * computed server-side and arrives on a DTO. There is deliberately no `add`,
 * `sum`, `applyGst` or `total` function here, and none should be added: a
 * helper that looks harmless is how a client-side total ends up on a checkout
 * screen disagreeing with the order the backend actually created.
 *
 * Amounts cross the wire as **strings**, matching the backend's `DECIMAL(19,4)`
 * columns (doc 02 §1). Parsing them into a JS `number` for display is safe —
 * rupee amounts in this domain are far inside the 2^53 integer-safe range — but
 * doing arithmetic on the parsed value is not, and is what the rule above bans.
 */

/** A money amount as it arrives from the API: a fixed-precision decimal string. */
export type Money = string;

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const INR_WHOLE = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Format a server amount as ₹ with Indian digit grouping (₹1,45,000.00).
 *
 * @param compact drop the paise when the amount is a whole number of rupees.
 *   Use on dense cards; never on a checkout or invoice total, where the exact
 *   figure being authorised must be legible in full.
 */
export function formatMoney(amount: Money | number | null | undefined, compact = false): string {
  if (amount == null || amount === '') return '—';
  const n = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(n)) return '—';
  if (compact && Number.isInteger(n)) return INR_WHOLE.format(n);
  return INR.format(n);
}

/**
 * Format a quantity with its unit, e.g. `20 KG`, `2.5 L`.
 *
 * Trailing zeros are trimmed — a requirement for 20 KG should read "20 KG", not
 * "20.0000 KG", even though the column is DECIMAL(19,4).
 */
export function formatQuantity(
  quantity: Money | number | null | undefined,
  unit?: string | null,
): string {
  if (quantity == null || quantity === '') return '—';
  const n = typeof quantity === 'number' ? quantity : Number(quantity);
  if (!Number.isFinite(n)) return '—';
  const digits = Number.isInteger(n) ? 0 : Math.min(4, (String(n).split('.')[1] ?? '').length);
  const text = n.toLocaleString('en-IN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return unit ? `${text} ${unit}` : text;
}

/** Format a GST rate for display, e.g. `5%`, `12.5%`. */
export function formatGstRate(rate: Money | number | null | undefined): string {
  if (rate == null || rate === '') return '—';
  const n = typeof rate === 'number' ? rate : Number(rate);
  if (!Number.isFinite(n)) return '—';
  return `${Number.isInteger(n) ? n : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}%`;
}
