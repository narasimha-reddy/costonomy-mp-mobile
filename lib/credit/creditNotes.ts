import { ApiError } from '@/lib/api/errors';
import { mayDecideClaims } from '@/lib/credit/claimInbox';
import { dueChip, type DueChip } from '@/lib/credit/dueChip';
import { isSettled } from '@/lib/credit/invoices';
import type {
  CreditInvoiceStatus, CreditNote, CreditNoteBody, CreditNoteReason, WriteOffBody, WriteOffQuickReason,
} from '@/models/credit';
import { formatMoney } from '@/utils/money';

/**
 * Credit notes, write-offs and refunds due: words and request bodies. Nothing here adds,
 * subtracts or compares money against money: an amount shown is one the server sent (or the text
 * the person typed), and what is still owed always comes from the server.
 */

type StoreRef = { id: number; supplierOrganizationId: number };
type CanForStore = (permission: string, store: StoreRef) => boolean;

export const CREDIT_NOTE_REASONS: { value: CreditNoteReason; label: string }[] = [
  { value: 'SHORT_SUPPLY', label: 'Short supply' },
  { value: 'QUALITY', label: 'Quality problem' },
  { value: 'PRICE', label: 'Price difference' },
  { value: 'CANCELLED', label: 'Cancelled order' },
  { value: 'GOODWILL', label: 'Goodwill' },
  { value: 'OTHER', label: 'Other' },
];

export const WRITE_OFF_QUICK_REASONS: { value: WriteOffQuickReason; label: string }[] = [
  { value: 'RESTAURANT_CLOSED', label: 'Restaurant closed' },
  { value: 'UNRECOVERABLE', label: 'Unrecoverable' },
  { value: 'SETTLED_OUTSIDE', label: 'Settled outside' },
  { value: 'GOODWILL', label: 'Goodwill' },
];

/** The reason code in plain words; an unknown code is made readable rather than shown raw. */
export function reasonWords(code: string | null | undefined): string {
  const known = CREDIT_NOTE_REASONS.find((r) => r.value === code);
  if (known != null) return known.label;
  const spaced = (code ?? '').replace(/_/g, ' ').trim().toLowerCase();
  return spaced === '' ? 'Credit note' : spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// ── Permissions ───────────────────────────────────────────────────────

/** Hiding is a courtesy: the server checks again (and answers 404 to anyone without the permission). */
export function mayWriteOff(canForStore: CanForStore, store: StoreRef | null | undefined): boolean {
  return store != null && canForStore('CREDIT_WRITE_OFF', store);
}

/** A credit note needs CREDIT_COLLECT or CREDIT_MODIFY, and an invoice that is open and owed. */
export function mayIssueCreditNote(
  invoice: { status: CreditInvoiceStatus | string; outstanding: string | number },
  canForStore: CanForStore,
  store: StoreRef | null | undefined,
): boolean {
  return mayDecideClaims(canForStore, store)
    && invoice.status !== 'PAID' && invoice.status !== 'WRITTEN_OFF'
    && Number(invoice.outstanding) > 0;
}

/** Whether an invoice still has anything owed that a write-off can act on. */
export function mayWriteOffInvoice(
  invoice: { status: CreditInvoiceStatus | string; outstanding: string | number },
  canForStore: CanForStore,
  store: StoreRef | null | undefined,
): boolean {
  return mayWriteOff(canForStore, store)
    && invoice.status !== 'PAID' && invoice.status !== 'WRITTEN_OFF'
    && Number(invoice.outstanding) > 0;
}

// ── What an invoice reads when credited ───────────────────────────────

type Credited = { creditedAmount?: string | number | null };

/** Something was credited (a credit note or a write-off took it off). */
export function hasCredit(invoice: Credited): boolean {
  return invoice.creditedAmount != null && Number(invoice.creditedAmount) > 0;
}

/**
 * Fully credited: the server calls it PAID but nothing was paid in money. The apps must not say
 * "Paid" (or "Paid by you") for it.
 */
export function settledByCreditNote(
  invoice: { status: string; paidAmount: string | number } & Credited,
): boolean {
  return invoice.status === 'PAID' && Number(invoice.paidAmount) === 0 && hasCredit(invoice);
}

export const SETTLED_BY_CREDIT_NOTE = 'Settled by credit note';

/** The chip every screen shows for an invoice: the usual due chip, except for a fully credited one. */
export function invoiceChip(invoice: {
  status: string; paidAmount: string | number; dueState?: string | null; daysToDue?: number | null;
} & Credited): DueChip | null {
  if (settledByCreditNote(invoice)) return { label: SETTLED_BY_CREDIT_NOTE, tone: 'success' };
  return dueChip(invoice.dueState, invoice.daysToDue);
}

const STATUS_TEXT: Record<CreditInvoiceStatus, string> = {
  ISSUED: 'Issued',
  PARTIALLY_PAID: 'Part paid',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
  WRITTEN_OFF: 'Written off',
};

/** The words after "Status:" on an invoice screen. */
export function invoiceStatusText(invoice: { status: string; paidAmount: string | number } & Credited & { dueState?: string | null }): string {
  if (settledByCreditNote(invoice)) return SETTLED_BY_CREDIT_NOTE;
  return STATUS_TEXT[invoice.status as CreditInvoiceStatus] ?? invoice.status;
}

/** "−₹2,100.00": the credit as a deduction, from the server's figure. */
export function creditedRowValue(amount: string | number | null | undefined): string {
  return `−${formatMoney(Math.abs(Number(amount)))}`;
}

/** An open invoice, as the server classifies it. Re-exported here so callers need one import. */
export { isSettled };

// ── Request bodies ────────────────────────────────────────────────────

/** The credit note to send: the amount text as checked, the code, and the note only when written. */
export function noteBody(amount: string, reasonCode: CreditNoteReason, note: string): CreditNoteBody {
  const text = note.trim();
  return { amount, reasonCode, ...(text !== '' ? { note: text } : {}) };
}

/**
 * The write-off to send. No amount when none was typed: the server then writes off everything it
 * says is owed, which is right even if the screen was a little out of date. `keepLineOpen` goes
 * only when on.
 */
export function writeOffBody(draft: {
  amount: string | null; reason: string; quick: WriteOffQuickReason | null; keepLineOpen: boolean;
}): WriteOffBody {
  return {
    ...(draft.amount != null ? { amount: draft.amount } : {}),
    reason: draft.reason.trim(),
    ...(draft.quick != null ? { quickReason: draft.quick } : {}),
    ...(draft.keepLineOpen ? { keepLineOpen: true } : {}),
  };
}

/** What a write-off means, before it is confirmed. `amount` is what is on screen: typed, or the server's outstanding. */
export function writeOffConsequence(amount: string | number, keepLineOpen: boolean): string {
  return `${formatMoney(amount)} will no longer be owed. This cannot be undone in the app. ${
    keepLineOpen ? 'Their credit line will stay open.' : 'Their credit line will be paused.'}`;
}

// ── Lines in a list ───────────────────────────────────────────────────

export const SYSTEM_CANCEL_TEXT = 'Order cancelled: credit note issued automatically';

/** One credit note as a list row: its number, why in plain words, and the supplier's note if any. */
export function creditNoteLine(note: CreditNote): { title: string; reason: string; detail: string | null } {
  const reason = note.kind === 'SYSTEM_CANCEL' ? SYSTEM_CANCEL_TEXT
    : note.kind === 'WRITE_OFF' ? 'Written off'
      : reasonWords(note.reasonCode);
  const detail = note.note != null && note.note.trim() !== '' ? note.note : null;
  return { title: note.creditNoteNumber, reason, detail };
}

// ── Refusals in plain words ───────────────────────────────────────────

const FALLBACK = 'Please check the details and try again.';
const NOT_AVAILABLE = 'This invoice is no longer available. Go back and refresh.';
const KEY_REUSE = 'Your earlier try may have gone through. We refreshed this page: please check before trying again.';

function outstandingFrom(caught: ApiError): string | null {
  const v = caught.details?.outstanding;
  return (typeof v === 'string' || typeof v === 'number') && !Number.isNaN(Number(v)) ? String(v) : null;
}

function exceeds(caught: ApiError): string {
  const owed = outstandingFrom(caught);
  return owed == null
    ? 'That is more than what is still owed.'
    : `That is more than what is still owed. At most ${formatMoney(owed)} is owed on this invoice.`;
}

/** Why a credit note was refused. Never a raw code. */
export function creditNoteErrorText(caught: unknown): string {
  if (!(caught instanceof ApiError)) return "That didn't go through. Please try again.";
  switch (caught.code) {
    case 'CREDIT_NOTE_EXCEEDS_OUTSTANDING': return exceeds(caught);
    case 'CREDIT_NOTE_INVOICE_SETTLED':
      return 'This invoice is already settled. If money must go back, refund the restaurant directly.';
    case 'IDEMPOTENCY_KEY_REUSE': return KEY_REUSE;
    default: break;
  }
  if (caught.status === 403) return "You don't have permission to issue credit notes for this store.";
  if (caught.status === 404) return NOT_AVAILABLE;
  if (caught.status >= 400 && caught.status < 500) return caught.message !== '' ? caught.message : FALLBACK;
  return "That didn't go through. Please try again.";
}

/** Why a write-off was refused. Never a raw code. */
export function writeOffErrorText(caught: unknown): string {
  if (!(caught instanceof ApiError)) return "That didn't go through. Please try again.";
  switch (caught.code) {
    case 'CREDIT_WRITE_OFF_NOTHING_OWED': return 'Nothing is owed here, so there is nothing to write off.';
    case 'CREDIT_NOTE_EXCEEDS_OUTSTANDING': return exceeds(caught);
    case 'IDEMPOTENCY_KEY_REUSE': return KEY_REUSE;
    default: break;
  }
  if (caught.status === 403) return "You don't have permission to write off for this store.";
  if (caught.status === 404) return NOT_AVAILABLE;
  if (caught.status >= 400 && caught.status < 500) return caught.message !== '' ? caught.message : FALLBACK;
  return "That didn't go through. Please try again.";
}

export const OPS_ONLY_TEXT = 'Our team will settle this one.';

/** Why marking a refund was refused. A wallet refund is Mandi's to settle. */
export function refundErrorText(caught: unknown): string {
  if (caught instanceof ApiError) {
    if (caught.code === 'CREDIT_REFUND_OPS_ONLY') return OPS_ONLY_TEXT;
    if (caught.status === 403) return "You don't have permission to mark refunds for this store.";
    if (caught.status === 404) return 'This refund is no longer available. Go back and refresh.';
    if (caught.status >= 400 && caught.status < 500) return caught.message !== '' ? caught.message : FALLBACK;
  }
  return "That didn't go through. Please try again.";
}
