import { formatMoney, type Money } from '@/utils/money';

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
 * <p>`packSize packUnit (measureValue measureUnit) · price · brandName`, with
 * each part dropped when it is absent. The pack leads because it is what differs
 * between two suppliers' versions of the same product; the price is what the
 * reader is comparing; the brand qualifies both.
 *
 * <p><b>The price is inclusive of GST and comes from the server.</b> It is what a
 * unit actually costs, which is the only per-unit figure worth putting in front
 * of somebody comparing suppliers — one quoting exclusive against another
 * quoting inclusive is the classic way to make the dearer offer look cheaper.
 * The app never derives it: multiplying by `1 + rate/100` here would be money
 * arithmetic and would land a paisa off the line totals.
 *
 * <p>The measure shows **only when both** its value and unit are present: "500"
 * alone reads as a pack size and "(ML)" says nothing, so half a measure is worse
 * than none because it actively misinforms.
 *
 * <p>The SKU's own name is not repeated here. Suppliers very often name a SKU
 * after the product it maps to, so including it produced "Paneer / Paneer · 1 KG"
 * — a line repeating itself and burying the pack.
 *
 * @param priceInclusiveGst the line's own price with GST, already computed by the
 *                          server. Omitted where there is none — a pack with no
 *                          live offer shows its size and brand and no figure,
 *                          rather than a zero that reads as free.
 */
export function skuSecondaryLine(
  sku: SkuDescriptor | null | undefined,
  priceInclusiveGst?: Money | null,
): string {
  if (sku == null) return '';

  const parts: string[] = [];

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

  if (priceInclusiveGst != null && priceInclusiveGst !== '') {
    parts.push(formatMoney(priceInclusiveGst));
  }

  if (sku.brandName != null && sku.brandName !== '') {
    parts.push(sku.brandName);
  }

  return parts.join(' · ');
}

/** The name to lead with: the pack's own, falling back to the product's. */
export function skuTitle(sku: SkuDescriptor | null | undefined): string {
  if (sku == null) return 'Item';
  return sku.productName ?? sku.skuName ?? 'Item';
}
