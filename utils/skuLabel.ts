/**
 * The line under the name: the pack, and the SKU's own name only when it adds
 * something.
 *
 * <p>Suppliers very often name a SKU after the product it maps to, so showing
 * both produces "Paneer / Paneer · 1 KG" — a line that repeats itself and buries
 * the pack size, which is the part that actually differs between suppliers.
 */
export function skuSecondaryLine(
  productName: string | null,
  skuName: string | null,
  packLabel: string | null,
): string {
  const parts = skuName != null && skuName !== productName ? [skuName] : [];
  if (packLabel != null && packLabel !== '') parts.push(packLabel);
  return parts.join(' · ');
}
