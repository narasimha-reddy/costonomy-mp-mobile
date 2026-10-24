import type { PaymentPreview, RecordPaymentBody, RecordedPayment, SupplierPaymentMethod } from '@/models/credit';
import { formatMoney } from '@/utils/money';

/**
 * The supplier's "I received money" sheet: what is typed, what is sent, how the server's
 * preview is worded. Nothing here adds or subtracts money: the amount sent is the text typed,
 * and every figure shown comes from the server.
 */

export interface RecordMethod {
  value: SupplierPaymentMethod;
  label: string;
  icon: { set: 'ion' | 'mci'; name: string };
}

/** In the order shown. */
export const RECORD_METHODS: readonly RecordMethod[] = [
  { value: 'CASH', label: 'Cash', icon: { set: 'mci', name: 'cash' } },
  { value: 'UPI', label: 'UPI', icon: { set: 'mci', name: 'cellphone' } },
  { value: 'BANK_TRANSFER', label: 'Bank transfer', icon: { set: 'mci', name: 'bank-outline' } },
  { value: 'CHEQUE', label: 'Cheque', icon: { set: 'mci', name: 'checkbook' } },
  { value: 'CARD', label: 'Card', icon: { set: 'ion', name: 'card-outline' } },
];

const REFERENCE_MIN = 4;
const REFERENCE_MAX = 64;
const NOTE_MAX = 500;
/** The server takes 15 whole digits; a typed figure beyond 13 is a slip, and the server has the last word. */
const MAX_WHOLE_DIGITS = 13;

/** UPI, bank transfer and cheque must say which payment it was; cash and card may have no number. */
export function referenceRequired(method: SupplierPaymentMethod): boolean {
  return method === 'UPI' || method === 'BANK_TRANSFER' || method === 'CHEQUE';
}

/**
 * What a pasted or typed amount becomes: no rupee sign, spaces or commas, no letters or minus
 * sign, one decimal point. "₹ 2,500.50" is "2500.50".
 */
export function cleanAmountInput(raw: string): string {
  let out = '';
  let dot = false;
  for (const ch of raw.replace(/[₹\s,]/g, '')) {
    if (ch === '.') {
      if (dot) continue;
      dot = true;
      out += ch;
    } else if (ch >= '0' && ch <= '9') {
      out += ch;
    }
  }
  return out;
}

export interface AmountCheck {
  /** The amount to send, "2500.00", when it reads as more than zero with at most 2 decimals. */
  amount: string | null;
  error: string | null;
}

/** Reads the amount as text, never as a float: the string typed is the string sent. */
export function checkAmount(text: string): AmountCheck {
  const m = /^(\d*)(?:\.(\d*))?$/.exec(text);
  if (text === '' || m == null) return { amount: null, error: null };
  const whole = m[1] ?? '';
  const fraction = m[2] ?? '';
  if (fraction.length > 2) return { amount: null, error: 'Use at most 2 decimal places.' };
  if (whole.length > MAX_WHOLE_DIGITS) return { amount: null, error: 'That amount is too large.' };
  if (/^0*$/.test(whole) && /^0*$/.test(fraction)) {
    return { amount: null, error: 'Enter an amount more than zero.' };
  }
  const digits = whole.replace(/^0+(?=\d)/, '') || '0';
  return { amount: `${digits}.${fraction.padEnd(2, '0')}`, error: null };
}

/** The reference's error for this method, or null when it is fine as it stands. */
export function checkReference(method: SupplierPaymentMethod, reference: string): string | null {
  const ref = reference.trim();
  if (ref === '') return referenceRequired(method) ? 'Enter the payment reference (4 to 64 characters).' : null;
  if (ref.length < REFERENCE_MIN || ref.length > REFERENCE_MAX) return 'The reference must be 4 to 64 characters.';
  return null;
}

export interface RecordDraft {
  amountText: string;
  method: SupplierPaymentMethod;
  reference: string;
  paidOn: string;
  note: string;
}

export interface RecordCheck {
  valid: boolean;
  amount: string | null;
  errors: { amount?: string; reference?: string; paidOn?: string; note?: string };
}

/**
 * Checks the form before a tap: a hint, never the verdict (the server checks again and its message
 * is shown if it disagrees). `today` is the India day by the server's clock.
 */
export function checkRecord(draft: RecordDraft, today: string): RecordCheck {
  const errors: RecordCheck['errors'] = {};
  const { amount, error } = checkAmount(draft.amountText);
  if (error != null) errors.amount = error;
  const reference = checkReference(draft.method, draft.reference);
  if (reference != null) errors.reference = reference;
  if (draft.paidOn > today) errors.paidOn = 'Pick today or an earlier day.';
  if (draft.note.trim().length > NOTE_MAX) errors.note = 'Keep the note to 500 characters.';
  return { valid: amount != null && Object.keys(errors).length === 0, amount, errors };
}

/** The request body: the amount as the checked string, text trimmed, `invoiceIds` only when some were chosen. */
export function recordBody(draft: RecordDraft, amount: string, invoiceIds: readonly number[]): RecordPaymentBody {
  const reference = draft.reference.trim();
  const note = draft.note.trim();
  return {
    amount,
    method: draft.method,
    ...(reference !== '' ? { reference } : {}),
    paidOn: draft.paidOn,
    ...(note !== '' ? { note } : {}),
    ...(invoiceIds.length > 0 ? { invoiceIds: [...invoiceIds] } : {}),
  };
}

/** A server amount as a person would type it: "2500.0000" is "2500", "1200.5000" is "1200.5". */
export function plainAmount(amount: string | number | null | undefined): string {
  if (amount == null || amount === '') return '';
  const text = String(amount);
  return text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text;
}

export interface PreviewSummary {
  lines: string[];
  after: string;
}

/** The server's preview in plain words. Every figure is one the server sent. */
export function previewSummary(preview: PaymentPreview): PreviewSummary {
  const lines = preview.allocations.map((a) => (a.statusAfter === 'PAID'
    ? `Settles ${a.invoiceNumber} fully (${formatMoney(a.amount)})`
    : `Part payment on ${a.invoiceNumber}: ${formatMoney(a.amount)}. It will still owe the rest.`));
  const overdue = Number(preview.agreement.overdue) > 0
    ? `, of which ${formatMoney(preview.agreement.overdue)} is overdue` : '';
  return { lines, after: `After this they owe ${formatMoney(preview.agreement.due)}${overdue}.` };
}

/** The same words for a receipt that went in: the position is the one the server returned. */
export function receiptSummary(receipt: Pick<RecordedPayment, 'allocations' | 'agreement'>): PreviewSummary {
  const { lines, after } = previewSummary({ ...receipt, amount: '', pendingClaims: [] });
  return { lines, after: after.replace('After this they owe', 'They now owe') };
}
