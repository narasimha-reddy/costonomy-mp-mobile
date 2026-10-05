import type { CreditDueState, CreditInvoice } from '@/models/credit';

/** The list endpoint may also carry the order number; older payloads do not. */
export type CreditInvoiceListItem = CreditInvoice & { orderNumber?: string | null };

/** Most urgent first. */
const URGENCY: Record<string, number> = {
  OVERDUE: 0,
  IN_GRACE: 1,
  DUE_TODAY: 2,
  DUE_SOON: 3,
  DUE_LATER: 4,
};
const UNKNOWN_URGENCY = 5;

/**
 * Settled means the server says so: classification is by `dueState` (or, on
 * older payloads without it, by `status`), never by comparing amounts or dates.
 */
export function isSettled(invoice: CreditInvoice): boolean {
  const state: CreditDueState | string | undefined = invoice.dueState ?? invoice.status;
  return state === 'PAID' || state === 'WRITTEN_OFF';
}

function compareText(a: string | null | undefined, b: string | null | undefined): number {
  const x = a ?? '';
  const y = b ?? '';
  return x < y ? -1 : x > y ? 1 : 0;
}

/**
 * Splits invoices into open and paid. Open: overdue first, then in grace, due
 * today, due soon, due later; ties by due date ascending. Paid: latest settled first.
 */
export function splitInvoices<T extends CreditInvoice>(invoices: readonly T[]): { open: T[]; paid: T[] } {
  const open = invoices.filter((i) => !isSettled(i));
  const paid = invoices.filter(isSettled);
  const rank = (i: CreditInvoice) => URGENCY[i.dueState ?? ''] ?? UNKNOWN_URGENCY;
  open.sort((a, b) => rank(a) - rank(b) || compareText(a.dueDate, b.dueDate));
  paid.sort((a, b) => compareText(b.settledAt, a.settledAt));
  return { open, paid };
}
