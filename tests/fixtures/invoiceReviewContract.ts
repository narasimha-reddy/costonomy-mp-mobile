/**
 * The review contract as the API states it, taken from costonomy-mp-api `feat/wallet-invoice-review`:
 * `WalletInvoiceReviewIT` (the JSON its fake reader produces and the bodies it PUTs) and
 * `InvoiceReviewDtos` / `InvoiceReviews.review` (what a request may hold and the checks on it), with the
 * changes agreed in the API review (draft always sent, `taxOverride`, `lineNo` null for added lines,
 * `fromInvoice` / `deliveryOverridden` ignored on input, check.readingTotal / matchesReading).
 *
 * Raw JSON on purpose: numbers as JSON numbers, exactly as the server writes them, so the app's own
 * mapping is part of what is checked.
 */

/** `ReviewRequest`, `PartyIn`, `ItemIn`, `SkuIn`: every field the server reads. Anything else is ignored there. */
export const REQUEST_FIELDS = {
  body: ['version', 'supplier', 'invoiceNumber', 'invoiceDate', 'stockInDate', 'paymentStatus', 'items', 'delivery', 'taxOverride'],
  supplier: ['id', 'name'],
  item: ['lineNo', 'sku', 'quantity', 'unit', 'amount', 'tax', 'ignoredDeviation'],
  sku: ['id', 'name', 'unit', 'unitPrice'],
} as const;

const skuMatch = (id: number, name: string, unitPrice: number) => ({ id, name, unit: 'KG', unitPrice, categoryName: 'Seafood' });

/** The fake reader's Kosta bill (`InvoiceTestSupport`): what `reading` holds after the upload is READ. */
export function itReading() {
  return {
    vendorName: 'KOSTA Delights', vendorAddress: 'Hyderabad', invoiceNumber: '1631', invoiceDate: '04/09/26',
    customerName: 'Delicia', currency: 'INR',
    items: [
      { name: '16/20 prawns', quantity: 2, unit: 'KG', unitPrice: 560, total: 1120, amount: null, tax: null, skuMatch: skuMatch(9465, 'Prawns 16/20', 360) },
      { name: '21/25 prawns', quantity: 2, unit: 'KG', unitPrice: 450, total: 900, amount: null, tax: null, skuMatch: skuMatch(152, 'PRAWNS 21/25', 300) },
      { name: '30/50 prawns', quantity: 2, unit: 'KG', unitPrice: 400, total: 800, amount: null, tax: null, skuMatch: skuMatch(9001, 'Prawns 30/40', 270) },
    ],
    subtotal: 2820, tax: null, delivery: null, total: 2820,
    supplierMatch: { id: 2001, name: 'Kosta Delights - Sea Food' },
  };
}

function itLine(lineNo: number, from: ReturnType<typeof itReading>['items'][number]) {
  const lineTotal = from.total;
  return {
    lineNo,
    fromInvoice: { name: from.name, quantity: from.quantity, unit: from.unit, unitPrice: from.unitPrice, total: from.total },
    sku: { id: from.skuMatch.id, name: from.skuMatch.name, unit: 'KG', unitPrice: from.skuMatch.unitPrice },
    quantity: 2, unit: 'KG', amount: from.total, tax: 0.0, lineTotal, itemPrice: lineTotal / 2,
    deviation: lineNo === 1 ? 'ABOVE' : null, ignoredDeviation: false,
  };
}

/** GET …/invoice once the fake reader has READ the bill (`draft()` in the IT). */
export function itInvoiceRead(today: string) {
  const reading = itReading();
  return {
    status: 'READ', createdAt: '2026-09-10T04:30:00Z', pageCount: 1, attempts: 1, error: null,
    pages: [{ page: 1, contentType: 'image/jpeg', sizeBytes: 1000, url: 'https://files.test/p1?sig=x', expiresAt: '2026-09-10T04:35:00Z' }],
    reading,
    check: { paid: 2820, billTotal: 2820, matches: true, difference: 0.0, readingTotal: 2820, matchesReading: true },
    version: 2,
    draft: {
      supplier: { id: 2001, name: 'Kosta Delights - Sea Food' },
      invoiceNumber: '1631', invoiceDate: '04/09/26', stockInDate: today, paymentStatus: 'PENDING',
      items: reading.items.map((it, i) => itLine(i + 1, it)),
      delivery: 0.0, deliveryOverridden: false, taxOverride: null,
      subtotal: 2820.0, tax: 0.0, total: 2820.0, reviewedAt: null, reviewedBy: null,
    },
    review: null,
  };
}

/** The same bill made UNREADABLE (`unreadableFilledByHand`): no reading, an empty draft. */
export function itInvoiceUnreadable(today: string) {
  const read = itInvoiceRead(today);
  return {
    ...read,
    status: 'UNREADABLE',
    error: 'We could not read this bill. You can still view the photo.',
    reading: null,
    check: { paid: 2820, billTotal: null, matches: null, difference: null, readingTotal: null, matchesReading: null },
    draft: {
      supplier: { id: null, name: '' }, invoiceNumber: null, invoiceDate: null, stockInDate: today, paymentStatus: 'PENDING',
      items: [], delivery: 0, deliveryOverridden: false, taxOverride: null, subtotal: 0, tax: 0, total: 0, reviewedAt: null, reviewedBy: null,
    },
  };
}

/**
 * The review `saveReview()` stores, as GET returns it afterwards: line 2 removed, line 3 re-matched,
 * line 1 ignored with tax, and a line the owner added (lineNo null). Once a review exists the draft is
 * still sent beside it.
 */
export function itInvoiceReviewed(today: string) {
  const read = itInvoiceRead(today);
  const draft = read.draft;
  return {
    ...read,
    version: 3,
    review: {
      ...draft,
      paymentStatus: 'COMPLETED',
      items: [
        { ...draft.items[0]!, tax: 56.1, lineTotal: 1176.1, itemPrice: 588.05, ignoredDeviation: true },
        { ...draft.items[2]!, sku: { id: 9002, name: 'Prawns 30/50', unit: 'KG', unitPrice: 250 }, deviation: null },
        { lineNo: null, fromInvoice: null, sku: { id: null, name: 'Ice', unit: 'KG', unitPrice: null }, quantity: 1, unit: 'KG',
          amount: 99.99, tax: 0.0, lineTotal: 99.99, itemPrice: 99.99, deviation: null, ignoredDeviation: false },
      ],
      delivery: 50.0, deliveryOverridden: true,
      subtotal: 2019.99, tax: 56.1, total: 2126.09, reviewedAt: '2026-09-10T05:00:00Z', reviewedBy: 77,
    },
  };
}

type Json = Record<string, unknown>;

const isDecimal = (v: unknown) => (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()));
const decimals = (v: unknown) => (String(v).split('.')[1] ?? '').replace(/0+$/, '').length;
const intDigits = (v: unknown) => String(v).replace(/^-/, '').split('.')[0]!.replace(/^0+(?=\d)/, '').length;
const fits = (v: unknown, i: number, d: number) => intDigits(v) <= i && decimals(v) <= d;

/**
 * `InvoiceReviews.review`'s checks, ported line for line (with the agreed changes: `taxOverride` checked
 * like money, SKU prices up to four places). Returns the 400's `details.fields`; empty means a 200.
 */
export function serverFieldErrors(body: Json, readItemCount: number, today: string): Record<string, string> {
  const errors: Record<string, string> = {};
  const money = (field: string, value: unknown, places = 2) => {
    if (!isDecimal(value)) errors[field] = 'Not a number.';
    else if (Number(value) < 0) errors[field] = 'Cannot be negative.';
    else if (!fits(value, 12, places)) errors[field] = `Use at most 12 digits and ${places} decimals.`;
  };
  if (body.version == null) errors.version = "Send the bill's version.";
  const supplier = body.supplier as Json | null;
  if (supplier == null || typeof supplier.name !== 'string' || supplier.name.trim() === '') errors['supplier.name'] = "Enter the supplier's name.";
  else if (supplier.id != null && Number(supplier.id) <= 0) errors['supplier.id'] = 'Choose a supplier from the list.';
  const stockIn = body.stockInDate;
  const latest = new Date(`${today}T00:00:00Z`);
  latest.setUTCDate(latest.getUTCDate() + 1);
  if (typeof stockIn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(stockIn)) errors.stockInDate = 'Enter the stock-in date as YYYY-MM-DD.';
  else if (stockIn > latest.toISOString().slice(0, 10)) errors.stockInDate = 'The stock-in date cannot be in the future.';
  if (body.paymentStatus !== 'PENDING' && body.paymentStatus !== 'COMPLETED') errors.paymentStatus = 'Choose PENDING or COMPLETED.';
  if (body.delivery != null) money('delivery', body.delivery);
  if (body.taxOverride != null) money('taxOverride', body.taxOverride);
  const items = Array.isArray(body.items) ? (body.items as Json[]) : [];
  if (items.length === 0) errors.items = 'Add at least one item.';
  const seen = new Set<number>();
  items.forEach((item, i) => {
    const at = `items[${i}]`;
    if (item.lineNo != null) {
      const n = Number(item.lineNo);
      if (!Number.isInteger(n) || n < 1 || n > readItemCount) errors[`${at}.lineNo`] = 'This line is not on the bill.';
      else if (seen.has(n)) errors[`${at}.lineNo`] = 'Each bill line can appear once.';
      else seen.add(n);
    }
    const sku = item.sku as Json | null;
    if (sku == null || typeof sku.name !== 'string' || sku.name.trim() === '') errors[`${at}.sku.name`] = 'Choose or name the SKU for this line.';
    if (sku != null && sku.id != null && Number(sku.id) <= 0) errors[`${at}.sku.id`] = 'Choose a SKU from the list.';
    if (sku != null && sku.unitPrice != null) money(`${at}.sku.unitPrice`, sku.unitPrice, 4);
    if (item.quantity == null || !isDecimal(item.quantity) || Number(item.quantity) <= 0) errors[`${at}.quantity`] = 'Enter a quantity above 0.';
    else if (!fits(item.quantity, 9, 3)) errors[`${at}.quantity`] = 'Use at most 9 digits and 3 decimals for the quantity.';
    if (item.amount == null) errors[`${at}.amount`] = 'Enter the amount.';
    else money(`${at}.amount`, item.amount);
    if (item.tax != null) money(`${at}.tax`, item.tax);
  });
  return errors;
}

/** Every key in a request body that the server does not read (it would be ignored, so it should not be sent). */
export function unreadFields(body: Json): string[] {
  const extra: string[] = [];
  const check = (obj: Json | null | undefined, allowed: readonly string[], at: string) => {
    if (obj == null) return;
    for (const k of Object.keys(obj)) if (!allowed.includes(k)) extra.push(`${at}${k}`);
  };
  check(body, REQUEST_FIELDS.body, '');
  check(body.supplier as Json, REQUEST_FIELDS.supplier, 'supplier.');
  ((body.items as Json[]) ?? []).forEach((item, i) => {
    check(item, REQUEST_FIELDS.item, `items[${i}].`);
    check(item.sku as Json, REQUEST_FIELDS.sku, `items[${i}].sku.`);
  });
  return extra;
}
