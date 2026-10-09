import { sumAmounts } from '@/lib/credit/sum';
import type { PayableInvoices, PayableSupplier, PayItem } from '@/models/creditPay';

/**
 * Which invoices are ticked in the pay picker. Pure: every function returns a new
 * selection. Only ids are held; the amounts always come from the server's list.
 */
export interface Selection {
  ids: ReadonlySet<number>;
}

export const EMPTY: Selection = { ids: new Set<number>() };

export function toggle(sel: Selection, invoiceId: number): Selection {
  const next = new Set(sel.ids);
  if (next.has(invoiceId)) next.delete(invoiceId); else next.add(invoiceId);
  return { ids: next };
}

export function supplierState(sel: Selection, supplier: PayableSupplier): 'none' | 'some' | 'all' {
  if (!supplier.payable || supplier.invoices.length === 0) return 'none';
  const on = supplier.invoices.filter((i) => sel.ids.has(i.invoiceId)).length;
  if (on === 0) return 'none';
  return on === supplier.invoices.length ? 'all' : 'some';
}

/** All on if any is off; all off if all are on. A supplier that cannot be paid here is left alone. */
export function toggleSupplier(sel: Selection, supplier: PayableSupplier): Selection {
  if (!supplier.payable) return sel;
  const next = new Set(sel.ids);
  const turnOff = supplierState(sel, supplier) === 'all';
  for (const invoice of supplier.invoices) {
    if (turnOff) next.delete(invoice.invoiceId); else next.add(invoice.invoiceId);
  }
  return { ids: next };
}

/** After a refetch: drop what is no longer listed or no longer payable. */
export function prune(sel: Selection, data: PayableInvoices): Selection {
  const keep = new Set<number>();
  for (const supplier of data.suppliers) {
    if (!supplier.payable) continue;
    for (const invoice of supplier.invoices) if (sel.ids.has(invoice.invoiceId)) keep.add(invoice.invoiceId);
  }
  return keep.size === sel.ids.size ? sel : { ids: keep };
}

export function preselect(data: PayableInvoices, p: { agreementId?: number; invoiceIds?: number[] }): Selection {
  const wanted = new Set(p.invoiceIds ?? []);
  const ids = new Set<number>();
  for (const supplier of data.suppliers) {
    if (!supplier.payable) continue;
    for (const invoice of supplier.invoices) {
      if (supplier.agreementId === p.agreementId || wanted.has(invoice.invoiceId)) ids.add(invoice.invoiceId);
    }
  }
  return { ids };
}

/** What is sent: the chosen invoices in server order, each with the outstanding the server showed, untouched. */
export function itemsOf(sel: Selection, data: PayableInvoices): PayItem[] {
  const items: PayItem[] = [];
  for (const supplier of data.suppliers) {
    if (!supplier.payable) continue;
    for (const invoice of supplier.invoices) {
      if (sel.ids.has(invoice.invoiceId)) items.push({ invoiceId: invoice.invoiceId, outstanding: invoice.outstanding });
    }
  }
  return items;
}

/** The bar's figures. The total is a display sum of server amounts (never sent); null if one is unreadable. */
export function barText(sel: Selection, data: PayableInvoices): { count: number; total: string | null } {
  const items = itemsOf(sel, data);
  return { count: items.length, total: items.length === 0 ? null : sumAmounts(items.map((i) => i.outstanding)) };
}

/**
 * The "Paid direct" reports still waiting on the chosen invoices, summed for the double-pay warning
 * (display only). Null when none of the chosen invoices has one, or the figure is unreadable.
 */
export function waitingOf(sel: Selection, data: PayableInvoices): string | null {
  const waiting: string[] = [];
  for (const supplier of data.suppliers) {
    if (!supplier.payable) continue;
    for (const invoice of supplier.invoices) {
      if (sel.ids.has(invoice.invoiceId) && Number(invoice.openClaimsAmount) > 0) waiting.push(invoice.openClaimsAmount);
    }
  }
  return waiting.length === 0 ? null : sumAmounts(waiting);
}
