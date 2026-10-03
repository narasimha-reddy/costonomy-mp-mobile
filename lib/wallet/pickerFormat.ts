const UNIT_PRICE = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

/**
 * A SKU's unit price: up to 4 decimals (the column's precision), trailing zeros trimmed but never
 * fewer than 2, so a per-gram price like 0.4525 is not shown as ₹0.00. Same grouping as formatMoney.
 */
export function formatUnitPrice(price: string | number | null | undefined, unit?: string | null): string | null {
  if (price == null || price === '') return null;
  const n = typeof price === 'number' ? price : Number(price);
  if (!Number.isFinite(n)) return null;
  const text = UNIT_PRICE.format(n);
  return `${text}${unit ? `/${unit}` : ''}`;
}
