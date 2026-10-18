import { barText, EMPTY, itemsOf, preselect, prune, supplierState, toggle, toggleSupplier, waitingOf } from '@/lib/credit/pay/selection';
import type { PayableInvoice, PayableInvoices, PayableSupplier } from '@/models/creditPay';

function inv(invoiceId: number, outstanding: string): PayableInvoice {
  return {
    invoiceId, invoiceNumber: `INV-${invoiceId}`, supplierOrderId: null, status: 'OPEN', amount: outstanding,
    paidAmount: '0', creditedAmount: '0', outstanding, dueDate: '2026-10-20', overdueAfter: null,
    dueState: 'DUE_LATER', daysToDue: 5, openClaimsAmount: '0',
  };
}
function sup(agreementId: number, invoices: PayableInvoice[], payable = true): PayableSupplier {
  return {
    agreementId, supplierStoreId: agreementId, supplierName: `S${agreementId}`, storeName: null, agreementStatus: 'ACTIVE',
    payable, notPayableReason: payable ? null : 'Pay this supplier directly.', due: '0', overdue: '0', invoices,
  };
}
function data(suppliers: PayableSupplier[], maxInvoices = 50): PayableInvoices {
  return {
    outletId: 1, onlinePayEnabled: true, walletPayEnabled: true, methods: ['UPI', 'CARD', 'WALLET'],
    feePercent: '0', minOnlineAmount: '1.00', maxInvoices, suppliers,
  };
}
const D = data([
  sup(11, [inv(101, '6500.00'), inv(102, '0.10')]),
  sup(12, [inv(205, '5980.20')]),
  sup(13, [inv(301, '10.00')], false),
]);

describe('selection', () => {
  it('toggles one invoice on and off without touching the original', () => {
    const a = toggle(EMPTY, 101);
    expect([...a.ids]).toEqual([101]);
    expect(EMPTY.ids.size).toBe(0);
    expect(toggle(a, 101).ids.size).toBe(0);
  });

  it('supplier tri-state', () => {
    const s = D.suppliers[0] as PayableSupplier;
    expect(supplierState(EMPTY, s)).toBe('none');
    expect(supplierState(toggle(EMPTY, 101), s)).toBe('some');
    expect(supplierState(toggle(toggle(EMPTY, 101), 102), s)).toBe('all');
  });

  it('select all turns everything on when any is off, and off when all are on', () => {
    const s = D.suppliers[0] as PayableSupplier;
    const some = toggle(EMPTY, 101);
    const all = toggleSupplier(some, s);
    expect(supplierState(all, s)).toBe('all');
    expect(supplierState(toggleSupplier(all, s), s)).toBe('none');
  });

  it('keeps other suppliers when toggling one supplier', () => {
    const [a, b] = D.suppliers as [PayableSupplier, PayableSupplier];
    const sel = toggleSupplier(toggleSupplier(EMPTY, a), b);
    expect([...sel.ids].sort()).toEqual([101, 102, 205]);
    expect([...toggleSupplier(sel, a).ids]).toEqual([205]);
  });

  it('ignores a supplier that is not payable', () => {
    const np = D.suppliers[2] as PayableSupplier;
    expect(toggleSupplier(EMPTY, np).ids.size).toBe(0);
    expect(supplierState(EMPTY, np)).toBe('none');
  });

  it('prune drops ids no longer listed or no longer payable', () => {
    const sel = { ids: new Set([101, 205, 301, 999]) };
    expect([...prune(sel, D).ids].sort()).toEqual([101, 205]);
  });

  it('preselect by agreement, by invoice ids, and neither', () => {
    expect([...preselect(D, { agreementId: 11 }).ids].sort()).toEqual([101, 102]);
    expect([...preselect(D, { invoiceIds: [205, 999] }).ids]).toEqual([205]);
    expect(preselect(D, {}).ids.size).toBe(0);
    expect(preselect(D, { agreementId: 13 }).ids.size).toBe(0);
  });

  it('itemsOf copies outstanding verbatim and keeps the server order', () => {
    const sel = { ids: new Set([205, 102, 101]) };
    expect(itemsOf(sel, D)).toEqual([
      { invoiceId: 101, outstanding: '6500.00' },
      { invoiceId: 102, outstanding: '0.10' },
      { invoiceId: 205, outstanding: '5980.20' },
    ]);
  });

  it('barText counts and totals for display', () => {
    expect(barText(EMPTY, D)).toEqual({ count: 0, total: null });
    expect(barText({ ids: new Set([101, 205]) }, D)).toEqual({ count: 2, total: '12480.20' });
    expect(barText({ ids: new Set([102]) }, D)).toEqual({ count: 1, total: '0.10' });
  });

  it('barText total is null on a bad amount', () => {
    const bad = data([sup(1, [inv(1, 'abc')])]);
    expect(barText({ ids: new Set([1]) }, bad)).toEqual({ count: 1, total: null });
  });
});

describe('waitingOf', () => {
  it('sums reports waiting on chosen invoices only, null when none', () => {
    const withClaims = data([sup(1, [{ ...inv(1, '10.00'), openClaimsAmount: '4.50' }, inv(2, '5.00'), { ...inv(3, '1.00'), openClaimsAmount: '0.25' }])]);
    expect(waitingOf({ ids: new Set([1, 3]) }, withClaims)).toBe('4.75');
    expect(waitingOf({ ids: new Set([2]) }, withClaims)).toBeNull();
    expect(waitingOf(EMPTY, withClaims)).toBeNull();
  });
});
