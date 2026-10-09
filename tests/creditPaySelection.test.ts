import {
  barText, EMPTY, itemsOf, preselect, prune, supplierState, toggle, toggleSupplier,
} from '@/lib/credit/pay/selection';
import type { PayableInvoice, PayableInvoices, PayableSupplier } from '@/models/creditPay';

/**
 * Amount and outstanding differ on every invoice on purpose: a selection that
 * reads `amount` (or any other figure) instead of the server's `outstanding`
 * gets a different answer here.
 */
const inv = (invoiceId: number, outstanding: string, o: Partial<PayableInvoice> = {}): PayableInvoice => ({
  invoiceId, invoiceNumber: `INV-${invoiceId}`, supplierOrderId: 100 + invoiceId, status: 'ISSUED',
  amount: '99999.0000', paidAmount: '1.0000', creditedAmount: '0.0000', outstanding,
  dueDate: '2026-10-20', overdueAfter: null, dueState: 'DUE_LATER', daysToDue: 11, openClaimsAmount: '0.0000', ...o,
});
const sup = (agreementId: number, invoices: PayableInvoice[], o: Partial<PayableSupplier> = {}): PayableSupplier => ({
  agreementId, supplierStoreId: 50 + agreementId, supplierName: `Supplier ${agreementId}`, storeName: null,
  agreementStatus: 'ACTIVE', payable: true, notPayableReason: null, due: '0.0000', overdue: '0.0000', invoices, ...o,
});
const data = (suppliers: PayableSupplier[], o: Partial<PayableInvoices> = {}): PayableInvoices => ({
  outletId: 7, onlinePayEnabled: true, walletPayEnabled: true, methods: ['UPI', 'CARD', 'WALLET'],
  feePercent: '0.0000', minOnlineAmount: '1.0000', maxInvoices: 50, suppliers, ...o,
});

// Server order: supplier 2 first (it holds the overdue invoice), then supplier 1.
const DATA = data([
  sup(2, [inv(21, '600.5000', { dueState: 'OVERDUE', daysToDue: -3 }), inv(22, '100.2500')]),
  sup(1, [inv(11, '1500.0000'), inv(12, '0.1000')]),
  sup(3, [inv(31, '40.0000')], { payable: false, notPayableReason: 'Pay this supplier directly.' }),
]);
const [S2, S1, S3] = DATA.suppliers as [PayableSupplier, PayableSupplier, PayableSupplier];
const ids = (s: { ids: ReadonlySet<number> }) => [...s.ids].sort((a, b) => a - b);

describe('toggle', () => {
  it('adds an invoice, then removes it', () => {
    const on = toggle(EMPTY, 11);
    expect(ids(on)).toEqual([11]);
    expect(ids(toggle(on, 11))).toEqual([]);
  });

  it('never changes the selection it was given', () => {
    const on = toggle(EMPTY, 11);
    toggle(on, 12);
    expect(ids(EMPTY)).toEqual([]);
    expect(ids(on)).toEqual([11]);
  });
});

describe('supplier tri-state', () => {
  it('reports none, some and all', () => {
    expect(supplierState(EMPTY, S1)).toBe('none');
    expect(supplierState(toggle(EMPTY, 11), S1)).toBe('some');
    expect(supplierState(toggle(toggle(EMPTY, 11), 12), S1)).toBe('all');
  });

  it('counts only that supplier\'s own invoices', () => {
    expect(supplierState(toggle(EMPTY, 21), S1)).toBe('none');
  });

  it('select all turns every invoice on when none are', () => {
    expect(ids(toggleSupplier(EMPTY, S1))).toEqual([11, 12]);
  });

  it('select all turns the rest on when only some are', () => {
    const some = toggle(EMPTY, 11);
    const next = toggleSupplier(some, S1);
    expect(ids(next)).toEqual([11, 12]);
    expect(supplierState(next, S1)).toBe('all');
  });

  it('select all turns every invoice off when all are on, and leaves other suppliers alone', () => {
    const both = toggleSupplier(toggleSupplier(EMPTY, S1), S2);
    const next = toggleSupplier(both, S1);
    expect(ids(next)).toEqual([21, 22]);
  });

  it('ignores a supplier that cannot be paid', () => {
    const next = toggleSupplier(EMPTY, S3);
    expect(ids(next)).toEqual([]);
    expect(supplierState(next, S3)).toBe('none');
  });
});

describe('prune after a refetch', () => {
  it('drops ids the server no longer lists, keeps the rest', () => {
    const sel = toggle(toggle(toggle(EMPTY, 11), 21), 999);
    expect(ids(prune(sel, DATA))).toEqual([11, 21]);
  });

  it('drops an invoice whose supplier stopped being payable', () => {
    const sel = toggle(toggle(EMPTY, 11), 21);
    const after = data([sup(2, [inv(21, '600.5000')], { payable: false, notPayableReason: 'Pay this supplier directly.' }), S1]);
    expect(ids(prune(sel, after))).toEqual([11]);
  });

  it('drops an invoice that was paid elsewhere in the meantime', () => {
    const sel = toggle(toggle(EMPTY, 11), 12);
    const after = data([sup(1, [inv(11, '1500.0000')])]);
    expect(ids(prune(sel, after))).toEqual([11]);
  });

  it('is empty for an empty list', () => {
    expect(ids(prune(toggle(EMPTY, 11), data([])))).toEqual([]);
  });
});

describe('preselect', () => {
  it('selects all of one supplier\'s invoices by agreement id', () => {
    expect(ids(preselect(DATA, { agreementId: 1 }))).toEqual([11, 12]);
  });

  it('selects the named invoices, wherever they sit', () => {
    expect(ids(preselect(DATA, { invoiceIds: [22, 11] }))).toEqual([11, 22]);
  });

  it('skips ids that are not listed', () => {
    expect(ids(preselect(DATA, { invoiceIds: [11, 4242] }))).toEqual([11]);
    expect(ids(preselect(DATA, { agreementId: 4242 }))).toEqual([]);
  });

  it('never preselects what cannot be paid', () => {
    expect(ids(preselect(DATA, { agreementId: 3 }))).toEqual([]);
    expect(ids(preselect(DATA, { invoiceIds: [31, 11] }))).toEqual([11]);
  });

  it('selects nothing when asked for nothing', () => {
    expect(ids(preselect(DATA, {}))).toEqual([]);
  });
});

describe('itemsOf', () => {
  it('sends the invoice id and the outstanding the server showed, verbatim', () => {
    const items = itemsOf(toggle(toggle(EMPTY, 21), 12), DATA);
    // Not reformatted ("600.50"), not the amount, not a sum: the string as it arrived.
    expect(items).toEqual([
      { invoiceId: 21, outstanding: '600.5000' },
      { invoiceId: 12, outstanding: '0.1000' },
    ]);
  });

  it('has nothing but those two fields per item (the app never sends an amount)', () => {
    for (const item of itemsOf(toggleSupplier(EMPTY, S1), DATA)) {
      expect(Object.keys(item).sort()).toEqual(['invoiceId', 'outstanding']);
    }
  });

  it('keeps the server\'s order whatever order they were ticked in', () => {
    let sel = EMPTY;
    for (const id of [12, 22, 11, 21]) sel = toggle(sel, id);
    expect(itemsOf(sel, DATA).map((i) => i.invoiceId)).toEqual([21, 22, 11, 12]);
  });

  it('leaves out ids the list no longer has', () => {
    expect(itemsOf(toggle(toggle(EMPTY, 11), 999), DATA).map((i) => i.invoiceId)).toEqual([11]);
  });

  it('is empty for an empty selection', () => {
    expect(itemsOf(EMPTY, DATA)).toEqual([]);
  });
});

describe('barText', () => {
  it('counts the invoices and totals the server\'s outstanding figures', () => {
    const bar = barText(toggle(toggle(EMPTY, 21), 22), DATA);
    expect(bar.count).toBe(2);
    // 600.50 + 100.25 = 700.75, and not the 99999 amounts.
    expect(bar.total).toMatch(/700\.75/);
    expect(bar.total).not.toMatch(/99/);
  });

  it('adds exactly, with no float drift', () => {
    const bar = barText(toggle(toggle(EMPTY, 12), 22), data([
      sup(1, [inv(12, '0.1000'), inv(22, '0.2000')]),
    ]));
    expect(bar.total).toMatch(/0\.30(?!\d)/);
  });

  it('counts one invoice', () => {
    const bar = barText(toggle(EMPTY, 11), DATA);
    expect(bar.count).toBe(1);
    expect(bar.total).toMatch(/1,?500\.00/);
  });

  it('counts none when nothing is chosen', () => {
    expect(barText(EMPTY, DATA).count).toBe(0);
  });

  it('has no total when an amount cannot be read, rather than a wrong one', () => {
    const bad = data([sup(1, [inv(11, '1500.0000'), inv(12, 'abc')])]);
    const bar = barText(toggle(toggle(EMPTY, 11), 12), bad);
    expect(bar.count).toBe(2);
    expect(bar.total).toBeNull();
  });
});
