import type { Money } from '@/utils/money';

/**
 * How a supplier's pack is described. Mirrors `SkuDirectory.SkuDescriptor`.
 *
 * <p>The server sends the parts rather than a finished string so a narrow screen
 * can drop the least important one, and so every screen builds the line the same
 * way — which is the whole point of there being one of these.
 */
export interface SkuDescriptor {
  supplierSkuId: number;
  productName: string | null;
  skuName: string | null;
  brandName: string | null;
  packSize: Money | null;
  packUnit: string | null;
  measureValue: Money | null;
  measureUnit: string | null;
  imageUrl: string | null;
  status: string | null;
}

/**
 * "5 KG", not "5.0000 KG".
 *
 * <p>`stripTrailingZeros` on a whole number can leave scientific notation —
 * `5.0000` becomes `5E+0` — so the scale is pulled back when nothing is lost.
 */
function trimQuantity(value: Money | null): string | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return String(Number(n.toFixed(4)));
}

/**
 * The line under a SKU's name, everywhere a SKU is shown.
 *
 * <p>`brandName · packSize packUnit (measureValue measureUnit)`, with each part
 * dropped when it is absent. The measure is shown **only when both** its value
 * and unit are present: "500" and "(ML)" are each meaningless alone, and a
 * half-stated measure is worse than none because it reads as a pack size.
 *
 * <p>The SKU's own name is not repeated here. Suppliers very often name a SKU
 * after the product it maps to, so including it produced "Paneer / Paneer · 1 KG"
 * — a line that repeats itself and buries the pack, which is the part that
 * actually differs between suppliers.
 */
export function skuSecondaryLine(sku: SkuDescriptor | null | undefined): string {
  if (sku == null) return '';

  const parts: string[] = [];
  if (sku.brandName != null && sku.brandName !== '') {
    parts.push(sku.brandName);
  }

  const size = trimQuantity(sku.packSize);
  const pack = [size, sku.packUnit].filter((piece) => piece != null && piece !== '').join(' ');

  const measure = trimQuantity(sku.measureValue);
  const measureUnit = sku.measureUnit;
  const hasMeasure = measure != null && measureUnit != null && measureUnit !== '';

  if (pack !== '') {
    parts.push(hasMeasure ? `${pack} (${measure} ${measureUnit})` : pack);
  } else if (hasMeasure) {
    // No pack stated but a measure is: better than showing nothing.
    parts.push(`${measure} ${measureUnit}`);
  }

  return parts.join(' · ');
}

/** The name to lead with: the pack's own, falling back to the product's. */
export function skuTitle(sku: SkuDescriptor | null | undefined): string {
  if (sku == null) return 'Item';
  return sku.productName ?? sku.skuName ?? 'Item';
}
