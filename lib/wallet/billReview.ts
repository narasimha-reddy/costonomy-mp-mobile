import { ApiError } from '@/lib/api/errors';
import type {
  InvoiceReview,
  InvoiceReviewPayload,
  ReviewFromInvoice,
  ReviewLine,
  ReviewPaymentStatus,
  ReviewSku,
  WalletInvoice,
} from '@/models/wallet';

/**
 * Pure rules for reviewing a bill, ported from the cost app's Upload Invoice screen
 * (costonomy-mobile-app `app/(stack)/upload-invoice.tsx`): when a line is ready, when its price
 * deviates from the SKU's, what the footer says, and what is sent.
 *
 * <p><b>Money.</b> The server computes the saved subtotal, tax and total. While the owner types, the
 * screen shows a <i>preview</i> of them, worked out here in whole paise (integers, never floats) so a
 * preview can never drift by a paisa. After a save the server's figures replace the preview.
 */

// ── Typing numbers ────────────────────────────────────────────────────
// What a field keeps of the typing is decided in `numberInput.ts` (never guessing at commas).

export const MONEY_DECIMALS = 2;
/** Quantities are weighed: 0.125 KG is a real line, so three places. */
export const QTY_DECIMALS = 3;
/** Ten digits before the point keeps every paise figure far inside the safe-integer range. */
export const MONEY_INT_DIGITS = 10;
/** The server takes at most nine digits before the point for a quantity. */
export const QTY_INT_DIGITS = 9;
/** A SKU's own price may carry four places (a price per gram, from the cost app). */
export const SKU_PRICE_DECIMALS = 4;

/** Whether a stored number field holds what the fields can produce: digits and at most one point. */
export function isPlainDecimal(text: string): boolean {
  return /^\d*(\.\d*)?$/.test(text);
}

// ── Preview arithmetic, in integers ───────────────────────────────────

const DECIMAL = /^(-?)(\d*)(?:\.(\d*))?$/;

/** A decimal as an integer number of `1/10^places`, rounded half up; null when blank or not a number. */
function toUnits(value: string | number | null | undefined, places: number): number | null {
  if (value == null) return null;
  let text = typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '') : value.trim();
  if (/e/i.test(text)) {
    const n = Number(text);
    if (!Number.isFinite(n) || Math.abs(n) >= 1e15) return null;
    text = n.toFixed(places + 1);
  }
  const m = DECIMAL.exec(text);
  if (m == null || (m[2] === '' && (m[3] ?? '') === '')) return null;
  const digits = (m[3] ?? '').padEnd(places + 1, '0');
  let units = Number(m[2] || '0') * 10 ** places + Number(digits.slice(0, places) || '0');
  if (Number(digits[places]) >= 5) units += 1;
  return m[1] === '-' ? -units : units;
}

/** Rupees (string or number, as typed or as sent) to whole paise. */
export function toPaise(value: string | number | null | undefined): number | null {
  return toUnits(value, 2);
}

/** A quantity in thousandths. */
export function toMilli(value: string | number | null | undefined): number | null {
  return toUnits(value, 3);
}

/** Paise back to a rupee string with two places ("1120.00"), for formatting and sending. */
export function paiseToRupees(paise: number): string {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Thousandths back to a quantity string without trailing zeros ("2", "2.5"). */
export function milliToQuantity(milli: number): string {
  const sign = milli < 0 ? '-' : '';
  const abs = Math.abs(milli);
  const frac = String(abs % 1000).padStart(3, '0').replace(/0+$/, '');
  return `${sign}${Math.floor(abs / 1000)}${frac ? `.${frac}` : ''}`;
}

/** num / den rounded half up, for non-negative integers. */
function divRound(num: number, den: number): number {
  return Math.floor((2 * num + den) / (2 * den));
}

export interface LineNumbers {
  quantity: string | null;
  amount: string | null;
  tax: string | null;
}

/** Preview of a line's total: Amount + Tax, in paise (blank counts as zero). Cost app: `lineTotal`. */
export function previewLineTotal(line: LineNumbers): number {
  return (toPaise(line.amount) ?? 0) + (toPaise(line.tax) ?? 0);
}

/**
 * Preview of what one unit cost: (Amount + Tax) ÷ Qty, in paise, or null when there is no quantity or
 * no money. Tax is included because it is part of what was paid (cost app: `lineUnitPrice`).
 */
export function previewItemPrice(line: LineNumbers): number | null {
  const qty = toMilli(line.quantity) ?? 0;
  const total = previewLineTotal(line);
  if (qty <= 0 || total <= 0) return null;
  return divRound(total * 1000, qty);
}

export interface PreviewTotals {
  subtotal: number;
  tax: number;
  /** Σ line Tax, whether or not a bill-level tax replaces it. */
  lineTax: number;
  delivery: number;
  total: number;
}

/**
 * Preview of the summary, as the server adds it up: Subtotal = Σ Amount; Tax = the bill-level tax when
 * one is given, else Σ line Tax; Total = Subtotal + Tax + Delivery (paise).
 */
export function previewTotals(
  lines: LineNumbers[],
  delivery: string | null | undefined,
  taxOverride: string | null | undefined = null,
): PreviewTotals {
  let subtotal = 0;
  let lineTax = 0;
  for (const line of lines) {
    subtotal += toPaise(line.amount) ?? 0;
    lineTax += toPaise(line.tax) ?? 0;
  }
  const tax = toPaise(taxOverride) ?? lineTax;
  const deliveryPaise = toPaise(delivery) ?? 0;
  return { subtotal, tax, lineTax, delivery: deliveryPaise, total: subtotal + tax + deliveryPaise };
}

// ── Price deviation ───────────────────────────────────────────────────

/**
 * The cost app's threshold: a line's unit price is flagged when it is more than 50% above or below the
 * SKU's own price (`hasPriceDeviation(calculated, original, threshold = 0.5)`), strictly.
 */
export const DEVIATION_THRESHOLD = 0.5;

export type Deviation = 'above' | 'below';

/**
 * Whether this line's (Amount + Tax) ÷ Qty strays beyond ±50% of the SKU's price per unit.
 * Null without a SKU price, a quantity or any money, exactly like the cost app. Compared as exact
 * fractions, so 450.00 against 300.00 (exactly +50%) is not a deviation and 450.01 is.
 */
export function priceDeviation(line: LineNumbers & { sku: { unitPrice: string | null } | null }): Deviation | null {
  if (line.sku == null) return null;
  const ref = toUnits(line.sku.unitPrice, SKU_PRICE_DECIMALS) ?? 0; // 1/10000 rupee
  const qty = toMilli(line.quantity) ?? 0;
  const total = previewLineTotal(line); // paise
  if (ref <= 0 || qty <= 0 || total <= 0) return null;
  // unit price in 1/10000 rupee = total * 100 * 1000 / qty.
  // above: unit > ref * 1.5  ⇔  2·total·100000 > 3·ref·qty;  below: unit < ref / 2  ⇔  2·total·100000 < ref·qty
  const lhs = BigInt(total) * 200000n;
  if (lhs > BigInt(ref) * 3n * BigInt(qty)) return 'above';
  if (lhs < BigInt(ref) * BigInt(qty)) return 'below';
  return null;
}

/** A deviation the owner has not chosen to ignore: it must be looked at before saving. */
export function openDeviation(line: FormLine): Deviation | null {
  return line.ignoredDeviation ? null : priceDeviation(line);
}

// ── The form ──────────────────────────────────────────────────────────

/** A line as the form holds it: numbers as the text typed. */
export interface FormLine {
  /**
   * The phone's own name for the line, for React keys, error keys and edits. Never sent: the server
   * knows a line by `lineNo`, which only bill lines have.
   */
  key: string;
  /** The bill line (1..N) this came from, or null for a line the owner added. */
  lineNo: number | null;
  fromInvoice: ReviewFromInvoice | null;
  sku: ReviewSku | null;
  quantity: string;
  unit: string | null;
  amount: string;
  tax: string;
  ignoredDeviation: boolean;
}

export interface ReviewForm {
  supplier: { id: number | null; name: string };
  invoiceNumber: string;
  /** ISO day, or '' when none could be read. */
  invoiceDate: string;
  /** The date as read off the bill, shown when it could not be turned into a day. */
  invoiceDateRead: string | null;
  /**
   * Whether the owner has signed off on the invoice date. The cost app asks for this because the reader
   * misreads dates often enough that accepting one silently is the wrong default. A saved review is
   * signed off already. Not sent: picking a date or tapping Confirm sets it.
   */
  dateConfirmed: boolean;
  stockInDate: string;
  paymentStatus: ReviewPaymentStatus;
  lines: FormLine[];
  /** Delivery charges as typed ('' is none). */
  delivery: string;
  /** The draft's delivery (the bill's figure): what Reset goes back to. */
  draftDelivery: string;
  /** The bill-level tax that replaces the sum of the line taxes, as typed ('' is none: the lines' sum). */
  taxOverride: string;
  /** The draft's bill-level tax: what Reset goes back to. */
  draftTaxOverride: string;
}

let keySeq = 0;

/** A new client key for a line: random and unique on this phone ("l-1f3a9c0b-12"). */
export function newLineKey(): string {
  keySeq += 1;
  const random = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  return `l-${random}-${keySeq.toString(36)}`;
}

const str = (v: unknown): string => (v == null ? '' : String(v));
const moneyOrNull = (v: unknown): string | null => {
  if (v == null || v === '') return null;
  const p = toPaise(v as string | number);
  return p == null ? null : paiseToRupees(p);
};
const qtyOrNull = (v: unknown): string | null => {
  if (v == null || v === '') return null;
  const m = toMilli(v as string | number);
  return m == null ? null : milliToQuantity(m);
};

/** A SKU's price as sent: up to four places, at least two ("360.00", "0.4525", "12.125"). */
export function skuPriceOrNull(v: unknown): string | null {
  if (v == null || v === '') return null;
  const units = toUnits(v as string | number, SKU_PRICE_DECIMALS);
  if (units == null) return null;
  const sign = units < 0 ? '-' : '';
  const abs = Math.abs(units);
  const frac = String(abs % 10_000).padStart(4, '0').replace(/0+$/, '').padEnd(2, '0');
  return `${sign}${Math.floor(abs / 10_000)}.${frac}`;
}

/** Text for a number field from what the server sent: "1120.0000" → "1120", "12.50" → "12.5". */
function editable(v: unknown, places: number): string {
  if (v == null || v === '') return '';
  const units = places === 3 ? toMilli(v as string) : toPaise(v as string);
  if (units == null) return '';
  return places === 3 ? milliToQuantity(units) : paiseToRupees(units).replace(/\.?0+$/, '');
}

/** A money field that shows nothing (not "0") when the figure is zero or absent. */
function editableOrBlank(v: unknown): string {
  const text = editable(v, 2);
  return text === '0' ? '' : text;
}

function formLine(line: ReviewLine): FormLine {
  return {
    key: newLineKey(),
    lineNo: line.lineNo ?? null,
    fromInvoice: line.fromInvoice ?? null,
    sku: line.sku ?? null,
    quantity: editable(line.quantity, 3),
    unit: line.unit ?? null,
    amount: editable(line.amount, 2),
    tax: editable(line.tax, 2),
    ignoredDeviation: line.ignoredDeviation === true,
  };
}

/**
 * The editable form for a review (or the draft). `draft` is the server's draft, which Reset goes back
 * to for delivery and tax; without one, the review's own figures stand in.
 */
export function formFromReview(review: InvoiceReview, saved: boolean, draft: InvoiceReview | null = null): ReviewForm {
  const iso = parseToISODate(review.invoiceDate ?? '');
  const base = draft ?? review;
  return {
    supplier: { id: review.supplier?.id ?? null, name: review.supplier?.name ?? '' },
    invoiceNumber: str(review.invoiceNumber),
    invoiceDate: iso,
    invoiceDateRead: iso === '' && review.invoiceDate ? review.invoiceDate : null,
    dateConfirmed: saved,
    stockInDate: parseToISODate(review.stockInDate ?? ''),
    paymentStatus: review.paymentStatus === 'COMPLETED' ? 'COMPLETED' : 'PENDING',
    lines: (review.items ?? []).map(formLine),
    delivery: editableOrBlank(review.delivery),
    draftDelivery: editableOrBlank(base.delivery),
    taxOverride: editable(review.taxOverride, 2),
    draftTaxOverride: editable(base.taxOverride, 2),
  };
}

/**
 * The form for an invoice as the server sent it: the saved review, else the draft. Null when the
 * server sent neither (it always sends a draft once the bill is READ or UNREADABLE).
 */
export function formFromInvoice(invoice: WalletInvoice): ReviewForm | null {
  const draft = invoice.draft ?? null;
  if (invoice.review != null) return formFromReview(invoice.review, true, draft);
  return draft == null ? null : formFromReview(draft, false, draft);
}

/** Start over: the server's draft, as if the review screen had just been opened on the bill. */
export function formFromDraft(invoice: WalletInvoice): ReviewForm | null {
  return invoice.draft == null ? null : formFromReview(invoice.draft, false, invoice.draft);
}

/** A blank line for "Add SKU": not on the bill, everything to fill in. */
export function blankLine(key: string = newLineKey()): FormLine {
  return {
    key, lineNo: null, fromInvoice: null, sku: null, quantity: '', unit: null, amount: '', tax: '', ignoredDeviation: false,
  };
}

/** A line added by hand that nothing has been filled in on yet. */
export function isBlankLine(line: FormLine): boolean {
  return line.fromInvoice == null && line.sku == null && line.quantity === '' && line.amount === '' && line.tax === '';
}

/**
 * The SKU the bill line was matched to by the server (the reading's `skuMatch`), for the picker's
 * "Suggested" row. Never the owner's own earlier choice; null for an added line.
 */
export function matchedSku(invoice: WalletInvoice, lineNo: number | null): ReviewSku | null {
  if (lineNo == null) return null;
  const match = invoice.reading?.items?.[lineNo - 1]?.skuMatch;
  if (match == null) return null;
  return { id: match.id, name: match.name, unit: match.unit ?? null, unitPrice: match.unitPrice ?? null };
}

/** Delivery differs from the draft's (the bill's) figure: Reset is offered. */
export function deliveryChanged(form: Pick<ReviewForm, 'delivery' | 'draftDelivery'>): boolean {
  return (toPaise(form.delivery) ?? 0) !== (toPaise(form.draftDelivery) ?? 0);
}

/** The bill-level tax differs from the draft's: Reset is offered. */
export function taxOverrideChanged(form: Pick<ReviewForm, 'taxOverride' | 'draftTaxOverride'>): boolean {
  return toPaise(form.taxOverride) !== toPaise(form.draftTaxOverride);
}

// ── When a line is ready ──────────────────────────────────────────────

export type LineStatus = 'resolved' | 'new' | 'attention';

/**
 * The cost app's rule: a line is ready when it is resolved to a SKU, its quantity is above zero and
 * its amount (before tax) is above zero. Anything else needs attention.
 */
export function lineIsReady(line: Pick<FormLine, 'sku' | 'quantity' | 'amount'>): boolean {
  return line.sku != null && line.sku.name.trim() !== ''
    && (toMilli(line.quantity) ?? 0) > 0 && (toPaise(line.amount) ?? 0) > 0;
}

/** The chip on a line: Needs attention until it is ready; then New for a typed-in SKU, else Resolved. */
export function lineStatus(line: FormLine): LineStatus {
  if (!lineIsReady(line)) return 'attention';
  return line.sku?.id == null ? 'new' : 'resolved';
}

/** A discount or credit line on a bill reads as a negative amount; the server refuses it on save. */
const NEGATIVE_AMOUNT_HINT = 'The amount cannot be negative. Correct it or remove this line.';

/** The sentence under a line that is not ready, in the cost app's words. */
export function lineHint(line: FormLine): string | null {
  if (lineIsReady(line)) return null;
  if (line.sku == null) return 'Choose the SKU for this item.';
  const noQty = !((toMilli(line.quantity) ?? 0) > 0);
  const noAmt = !((toPaise(line.amount) ?? 0) > 0);
  if (noQty && noAmt) return 'Enter a quantity and amount.';
  if (noQty) return 'Enter a quantity.';
  return (toPaise(line.amount) ?? 0) < 0 ? NEGATIVE_AMOUNT_HINT : 'Enter an amount.';
}

export function attentionCount(lines: FormLine[]): number {
  return lines.filter((l) => !lineIsReady(l)).length;
}

export interface Readiness {
  /** Save can be pressed (the cost app's `canSubmit`). */
  ready: boolean;
  attention: number;
  /** The first line that needs attention (the footer's link goes there), or null. */
  firstAttention: string | null;
  /** The footer's status, as the cost app words it: "2 items need attention" or "All items ready". */
  message: string;
  /** What else stops Save once the items are ready (supplier, stock-in date, the date sign-off), or null. */
  blocker: { field: FieldKey; text: string } | null;
}

/**
 * The cost app's `isSnapshotReady` and footer. Save needs at least one line, every line ready, a
 * supplier, a stock-in date and the invoice date signed off. The footer's words count only the lines,
 * as there ("All items ready" can stand beside a disabled Save); the other conditions come back as
 * `blocker`, so the screen can say what is left instead of leaving a grey button unexplained.
 */
export function readiness(form: ReviewForm): Readiness {
  const attention = attentionCount(form.lines);
  const message = form.lines.length === 0
    ? 'Add at least one item'
    : attention > 0
      ? `${attention} item${attention === 1 ? '' : 's'} need${attention === 1 ? 's' : ''} attention`
      : 'All items ready';
  let blocker: Readiness['blocker'] = null;
  if (form.supplier.name.trim() === '') blocker = { field: 'supplier', text: 'Choose a supplier' };
  else if (!isISODate(form.stockInDate)) blocker = { field: 'stockInDate', text: 'Set a stock-in date' };
  else if (!form.dateConfirmed) blocker = { field: 'invoiceDate', text: 'Confirm the invoice date' };
  const ready = form.lines.length > 0 && attention === 0 && blocker == null;
  const firstAttention = form.lines.find((l) => !lineIsReady(l))?.key ?? null;
  return { ready, attention, firstAttention, message, blocker };
}

/** The one line the footer shows beside the total, and where tapping it goes. */
export interface FooterStatus {
  text: string;
  tone: 'ready' | 'attention' | 'error';
  /** The field to jump to, 'top' for the messages at the top of the form, or null (not a link). */
  target: FieldKey | 'top' | null;
}

/**
 * The footer's single status line, the most important thing first: a failed save, then lines that
 * need attention (the first one is the link), then the other condition Save waits for, then "All items
 * ready". One line, so the footer stays one row.
 */
export function footerStatus(
  ready: Readiness,
  problem: { message: string; target: FieldKey | 'top' | null } | null,
): FooterStatus {
  if (problem) return { text: problem.message, tone: 'error', target: problem.target };
  if (ready.attention > 0 || ready.message === 'Add at least one item') {
    return {
      text: ready.message,
      tone: 'attention',
      target: ready.firstAttention ? lineField(ready.firstAttention, 'row') : 'items',
    };
  }
  if (ready.blocker) return { text: ready.blocker.text, tone: 'attention', target: ready.blocker.field };
  return { text: ready.message, tone: 'ready', target: null };
}

// ── Checks on Save (the cost app's handleShowConfirmation) ─────────────

export interface SaveProblem {
  field: FieldKey;
  message: string;
}

/**
 * What still stops a save once Save is pressed: a SKU used on two lines (the same catalogue SKU, or two
 * new SKUs with the same name), or a price deviation that was neither fixed nor ignored. The first
 * problem is returned so the screen can scroll to it.
 */
export function saveProblem(form: ReviewForm): SaveProblem | null {
  const seenIds = new Set<number>();
  const seenNew = new Set<string>();
  for (const line of form.lines) {
    if (line.sku == null) continue;
    const id = line.sku.id;
    const newName = line.sku.name.trim().toLowerCase();
    const repeated = id != null ? seenIds.has(id) : seenNew.has(newName);
    if (repeated) {
      return { field: lineField(line.key, 'sku'), message: `“${line.sku.name}” is on more than one line. Choose a different SKU or remove a line.` };
    }
    if (id != null) seenIds.add(id);
    else seenNew.add(newName);
  }
  // The server refuses a negative tax or delivery; say so here, on the field, before sending.
  for (const line of form.lines) {
    if ((toPaise(line.tax) ?? 0) < 0) return { field: lineField(line.key, 'tax'), message: 'Tax cannot be negative.' };
  }
  if ((toPaise(form.delivery) ?? 0) < 0) return { field: 'delivery', message: 'Delivery charges cannot be negative.' };
  if ((toPaise(form.taxOverride) ?? 0) < 0) return { field: 'taxOverride', message: 'Tax cannot be negative.' };
  for (const line of form.lines) {
    if (openDeviation(line) != null) {
      return {
        field: lineField(line.key, 'price'),
        message: `Check the price of “${line.sku?.name ?? 'this item'}”, or tap Ignore if it is right.`,
      };
    }
  }
  return null;
}

// ── Search ────────────────────────────────────────────────────────────

/** Lines whose name on the bill or SKU name contains the query (cost app: `visibleItems`). */
export function filterLines<T extends Pick<FormLine, 'fromInvoice' | 'sku'>>(lines: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return lines;
  return lines.filter((l) => (l.fromInvoice?.name ?? '').toLowerCase().includes(q)
    || (l.sku?.name ?? '').toLowerCase().includes(q));
}

// ── What is sent ──────────────────────────────────────────────────────

/**
 * The PUT body: exactly what the server reads (D-114 `ReviewRequest`), nothing it works out itself.
 * Bill lines carry their `lineNo`; added lines carry null. `fromInvoice` and `deliveryOverridden` are
 * the server's to decide and are not sent. Numbers are plain decimal strings ("1120.00", "2.5"),
 * blanks are null. `taxOverride` is what the form holds: the draft's (or saved review's) figure unless
 * the owner changed it.
 */
export function buildReviewPayload(form: ReviewForm, version: number): InvoiceReviewPayload {
  return {
    version,
    supplier: { id: form.supplier.id, name: form.supplier.name.trim() },
    invoiceNumber: form.invoiceNumber.trim() || null,
    invoiceDate: form.invoiceDate || form.invoiceDateRead || null,
    stockInDate: form.stockInDate || null,
    paymentStatus: form.paymentStatus,
    items: form.lines.map((l) => ({
      lineNo: l.lineNo,
      sku: l.sku == null ? null : {
        id: l.sku.id,
        name: l.sku.name.trim(),
        unit: l.sku.unit ?? null,
        unitPrice: skuPriceOrNull(l.sku.unitPrice),
      },
      quantity: qtyOrNull(l.quantity),
      unit: l.unit ?? null,
      amount: moneyOrNull(l.amount),
      tax: moneyOrNull(l.tax),
      ignoredDeviation: l.ignoredDeviation,
    })),
    delivery: moneyOrNull(form.delivery),
    taxOverride: moneyOrNull(form.taxOverride),
  };
}

const withoutVersion = (p: InvoiceReviewPayload) => JSON.stringify({ ...p, version: 0 });

/**
 * A body in the form the server keeps it: blank tax is 0, no delivery is 0, a line without a unit takes
 * its SKU's. Two bodies that save the same review are equal here.
 */
function canonical(p: InvoiceReviewPayload): string {
  const zeroToNull = (v: string | null) => ((toPaise(v) ?? 0) === 0 ? null : v);
  return JSON.stringify({
    ...p,
    version: 0,
    invoiceNumber: p.invoiceNumber?.trim() || null,
    delivery: zeroToNull(p.delivery),
    items: p.items.map((i) => ({
      ...i,
      unit: i.unit?.trim() || i.sku?.unit?.trim() || null,
      tax: i.tax ?? '0.00',
      sku: i.sku == null ? null : { ...i.sku, unit: i.sku.unit?.trim() || null },
    })),
  });
}

/**
 * Whether the server holds what was sent: its saved review, read back the way the form reads it and
 * built into a body, saves the same as the body that was sent (the version aside). Used after a 409,
 * to tell "my own save went through and only its answer was lost" from "someone else saved".
 */
export function reviewMatchesPayload(review: InvoiceReview | null | undefined, sent: InvoiceReviewPayload): boolean {
  if (review == null) return false;
  return canonical(buildReviewPayload(formFromReview(review, true), 0)) === canonical(sent);
}

/**
 * Whether the form differs from where it started. Compared on what would be sent (so "2" and "2.00"
 * are the same) plus the date sign-off, which is part of the work the owner did.
 */
export function isDirty(form: ReviewForm, baseline: ReviewForm): boolean {
  return withoutVersion(buildReviewPayload(form, 0)) !== withoutVersion(buildReviewPayload(baseline, 0))
    || form.dateConfirmed !== baseline.dateConfirmed;
}

// ── Server field errors → inputs ──────────────────────────────────────

export type LinePart = 'sku' | 'quantity' | 'amount' | 'tax' | 'unit' | 'price' | 'row';
export type HeaderField =
  | 'supplier' | 'invoiceNumber' | 'invoiceDate' | 'stockInDate' | 'paymentStatus' | 'delivery' | 'taxOverride' | 'items';
export type FieldKey = HeaderField | `line:${string}:${LinePart}`;

/** The key of one part of one line, by the line's client key. */
export function lineField(key: string, part: LinePart): FieldKey {
  return `line:${key}:${part}`;
}

export interface FieldErrors {
  fields: Partial<Record<FieldKey, string>>;
  /** Messages whose path matched no input: shown together at the top of the form. */
  other: string[];
}

const HEADER_PATHS: Record<string, HeaderField> = {
  supplier: 'supplier', 'supplier.name': 'supplier', 'supplier.id': 'supplier',
  invoiceNumber: 'invoiceNumber', invoiceDate: 'invoiceDate', stockInDate: 'stockInDate',
  paymentStatus: 'paymentStatus', delivery: 'delivery', taxOverride: 'taxOverride', items: 'items',
};

const LINE_PARTS: Record<string, LinePart> = {
  sku: 'sku', quantity: 'quantity', amount: 'amount', tax: 'tax', unit: 'unit', ignoredDeviation: 'price', lineNo: 'row',
};

/**
 * The input a server path names, e.g. `items[0].quantity` → the quantity of the first line sent.
 * `sentKeys` are the client keys of the lines in the order they were sent.
 */
export function fieldForPath(path: string, sentKeys: string[]): FieldKey | null {
  const clean = path.trim().replace(/^review\./, '');
  const item = /^items\[(\d+)\](?:\.([A-Za-z]+))?/.exec(clean);
  if (item) {
    const key = sentKeys[Number(item[1])];
    if (key == null) return 'items';
    return lineField(key, LINE_PARTS[item[2] ?? ''] ?? 'row');
  }
  return HEADER_PATHS[clean] ?? null;
}

/** `details.fields` as the standard error sends it: a map of path → message(s), or a list of {field, message}. */
function rawFieldList(details: Record<string, unknown> | undefined): { path: string; message: string }[] {
  const fields = details?.fields;
  if (Array.isArray(fields)) {
    return fields
      .map((f) => f as { field?: unknown; path?: unknown; message?: unknown })
      .filter((f) => typeof (f.field ?? f.path) === 'string')
      .map((f) => ({ path: String(f.field ?? f.path), message: String(f.message ?? 'Check this field') }));
  }
  if (fields != null && typeof fields === 'object') {
    return Object.entries(fields as Record<string, unknown>).map(([path, message]) => ({
      path,
      message: Array.isArray(message) ? String(message[0] ?? 'Check this field') : String(message ?? 'Check this field'),
    }));
  }
  return [];
}

/**
 * A 400's per-field messages, each on the input it names (first message wins). A 400 without
 * `details.fields` (MALFORMED_REQUEST, or a VALIDATION_ERROR about the whole body) comes back as one
 * plain message in `other`, for the top of the form.
 */
export function fieldErrorsFrom(error: unknown, sentKeys: string[]): FieldErrors {
  const result: FieldErrors = { fields: {}, other: [] };
  if (!(error instanceof ApiError)) return result;
  for (const { path, message } of rawFieldList(error.details)) {
    const key = fieldForPath(path, sentKeys);
    if (key == null) result.other.push(message);
    else if (result.fields[key] == null) result.fields[key] = message;
  }
  if (Object.keys(result.fields).length === 0 && result.other.length === 0) {
    result.other.push(error.message || 'This review could not be saved. Check it and try again.');
  }
  return result;
}

const HEADER_ORDER: HeaderField[] = ['supplier', 'invoiceNumber', 'paymentStatus', 'invoiceDate', 'stockInDate', 'items'];
const PART_ORDER: LinePart[] = ['row', 'sku', 'quantity', 'amount', 'tax', 'unit', 'price'];

/** The first input with an error, top to bottom as the screen lays them out. */
export function firstErrorField(fields: Partial<Record<FieldKey, string>>, lines: { key: string }[]): FieldKey | null {
  for (const key of HEADER_ORDER) if (fields[key]) return key;
  for (const line of lines) {
    for (const part of PART_ORDER) {
      const key = lineField(line.key, part);
      if (fields[key]) return key;
    }
  }
  if (fields.taxOverride) return 'taxOverride';
  return fields.delivery ? 'delivery' : null;
}

// ── Dates ─────────────────────────────────────────────────────────────

const MONTH_WORDS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** The month (1-12) a word names: at least three letters and a prefix of the full name ("Mar", "Sept", "March"); else 0. */
function monthOf(word: string): number {
  const w = word.toLowerCase();
  if (w.length < 3) return 0;
  const i = MONTH_WORDS.findIndex((name) => name.startsWith(w));
  return i + 1;
}

const pad = (n: number) => String(n).padStart(2, '0');

function validDay(y: number, m: number, d: number): string {
  if (!(y >= 1900 && y <= 2999 && m >= 1 && m <= 12 && d >= 1)) return '';
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= days ? `${y}-${pad(m)}-${pad(d)}` : '';
}

const fullYear = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));

/**
 * A date as read off a bill, as an ISO day, or '' when it cannot be read. The cost app's
 * `parseToISODate` (yyyy-mm-dd, dd-Mon-yyyy, dd/mm/yyyy, dd-mm-yyyy), plus two-digit years,
 * dots, and "04 Sep 2026", "4th September 2026" and "March 4, 2026" (full or short month names). Numeric dates are day first.
 */
export function parseToISODate(text: string): string {
  const s = text.trim();
  if (!s) return '';
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return validDay(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})(?:st|nd|rd|th)?[-/. ]+([A-Za-z]+)\.?[-/. ,]+(\d{2}|\d{4})$/i.exec(s);
  if (m) {
    const month = monthOf(m[2] ?? '');
    return month ? validDay(fullYear(m[3] ?? ''), month, Number(m[1])) : '';
  }
  m = /^([A-Za-z]+)\.?[-/. ]+(\d{1,2})(?:st|nd|rd|th)?[-/. ,]+(\d{2}|\d{4})$/i.exec(s);
  if (m) {
    const month = monthOf(m[1] ?? '');
    return month ? validDay(fullYear(m[3] ?? ''), month, Number(m[2])) : '';
  }
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s);
  if (m) return validDay(fullYear(m[3] ?? ''), Number(m[2]), Number(m[1]));
  return '';
}

export function isISODate(text: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && parseToISODate(text) === text;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "3 Oct 2026" for an ISO day; '' for anything else. */
export function formatDay(iso: string): string {
  if (!isISODate(iso)) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTH_NAMES[(m ?? 1) - 1]} ${y}`;
}

/** "October 2026". */
export function monthTitle(year: number, month: number): string {
  return `${MONTH_LONG[month - 1] ?? ''} ${year}`;
}

/** The cells of a month view, Monday first: ISO days, with null for the blanks before the 1st. */
export function monthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0 Sunday
  const lead = (first + 6) % 7;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++) cells.push(`${year}-${pad(month)}-${pad(d)}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** The month before or after, as [year, month]. */
export function shiftMonth(year: number, month: number, by: number): [number, number] {
  const index = year * 12 + (month - 1) + by;
  return [Math.floor(index / 12), (index % 12) + 1];
}

/** Today in India, as an ISO day: what "Today" means to an outlet whatever the phone's zone. */
export function todayIST(now: Date = new Date()): string {
  const ist = new Date(now.getTime() + 330 * 60_000);
  return `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}`;
}

// ── New SKU form ──────────────────────────────────────────────────────

export const SKU_UNITS = ['KG', 'GM', 'LTR', 'ML', 'PCS', 'DOZEN', 'BOX', 'PACK'] as const;
export type SkuUnit = typeof SKU_UNITS[number];

const UNIT_ALIASES: Record<string, SkuUnit> = {
  KG: 'KG', KGS: 'KG', KILO: 'KG', KILOS: 'KG',
  GM: 'GM', G: 'GM', GMS: 'GM', GRAM: 'GM', GRAMS: 'GM',
  LTR: 'LTR', L: 'LTR', LT: 'LTR', LITRE: 'LTR', LITER: 'LTR', LTRS: 'LTR',
  ML: 'ML',
  PCS: 'PCS', PC: 'PCS', PIECE: 'PCS', PIECES: 'PCS', NOS: 'PCS', NO: 'PCS',
  DOZEN: 'DOZEN', DZ: 'DOZEN', DOZ: 'DOZEN',
  BOX: 'BOX', BOXES: 'BOX',
  PACK: 'PACK', PKT: 'PACK', PACKET: 'PACK', PACKS: 'PACK',
};

/** The unit a new SKU starts on: the line's own unit when it is one of ours, else KG (as the cost app). */
export function defaultSkuUnit(unit: string | null | undefined): SkuUnit {
  const key = (unit ?? '').trim().toUpperCase().replace(/\.$/, '');
  return UNIT_ALIASES[key] ?? 'KG';
}

/** Problems with the new-SKU sheet, or null. Name required; a price, when given, must be above zero. */
export function newSkuProblems(name: string, price: string): { name?: string; price?: string } | null {
  const problems: { name?: string; price?: string } = {};
  if (name.trim() === '') problems.name = 'Enter a name for the SKU';
  if (price.trim() !== '' && !((toPaise(price) ?? 0) > 0)) problems.price = 'Enter a price above zero, or leave it blank';
  return Object.keys(problems).length ? problems : null;
}

/** The SKU a line gets from the new-SKU sheet: no id, saved only in this review. */
export function newSku(name: string, unit: SkuUnit, price: string): ReviewSku {
  return { id: null, name: name.trim(), unit, unitPrice: moneyOrNull(price) };
}
