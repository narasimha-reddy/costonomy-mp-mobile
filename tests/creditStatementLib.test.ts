import {
  groupStatementByMonth, isDay, presetRange, rangeText, signedAmount, statementDetail,
  statementErrorMessage, walletEntryRoute, orderRoute, lineDay, methodLabel,
} from '@/lib/credit/statement';
import { ApiError } from '@/lib/api/errors';
import type { CreditStatementLine } from '@/models/credit';

function line(over: Partial<CreditStatementLine>): CreditStatementLine {
  return {
    at: '2026-10-05T10:00:00Z', type: 'UTILIZE', label: 'Order', amount: '100.0000',
    owedAfter: '100.0000', supplierOrderId: null, orderNumber: null, creditInvoiceId: null,
    invoiceNumber: null, source: null, method: null, reference: null, walletEntryId: null, ...over,
  };
}

describe('groupStatementByMonth', () => {
  it('puts 23:30 IST on the last day in that month and 00:00 IST on the first in the next', () => {
    const lines = [
      line({ at: '2026-10-31T18:30:00Z', label: 'first of Nov' }), // 00:00 IST 1 Nov
      line({ at: '2026-10-31T18:00:00Z', label: 'last of Oct' }), // 23:30 IST 31 Oct
    ];
    const groups = groupStatementByMonth(lines);
    expect(groups.map((g) => g.title)).toEqual(['November 2026', 'October 2026']);
    expect(groups[0]?.lines.map((l) => l.label)).toEqual(['first of Nov']);
    expect(groups[1]?.lines.map((l) => l.label)).toEqual(['last of Oct']);
  });

  it('keeps the server order inside a month and puts newer months first', () => {
    const groups = groupStatementByMonth([
      line({ at: '2026-10-09T10:00:00Z', label: 'b' }),
      line({ at: '2026-10-02T10:00:00Z', label: 'a' }),
      line({ at: '2026-09-20T10:00:00Z', label: 'z' }),
    ]);
    expect(groups.map((g) => g.month)).toEqual(['2026-10', '2026-09']);
    expect(groups[0]?.lines.map((l) => l.label)).toEqual(['b', 'a']);
  });
});

describe('signedAmount', () => {
  it('shows the server sign explicitly', () => {
    expect(signedAmount('1200.0000')).toBe('+₹1,200.00');
    expect(signedAmount('-500.0000')).toBe('−₹500.00');
  });
});

describe('statementDetail', () => {
  it('words a wallet repayment, a UPI one and a bank transfer', () => {
    const base = { type: 'REPAYMENT', invoiceNumber: 'INV-1' };
    expect(statementDetail(line({ ...base, source: 'WALLET' }))).toBe('INV-1 · Repayment · From wallet');
    expect(statementDetail(line({ ...base, source: 'SUPPLIER_RECORDED', method: 'UPI', reference: '123' })))
      .toBe('INV-1 · Repayment · UPI · ref 123');
    expect(statementDetail(line({ ...base, source: 'SUPPLIER_RECORDED', method: 'BANK_TRANSFER' })))
      .toBe('INV-1 · Repayment · Bank transfer');
  });
  it('is just the invoice number for an order', () => {
    expect(statementDetail(line({ invoiceNumber: 'INV-2' }))).toBe('INV-2');
  });
});

describe('ranges and routes', () => {
  it('words a range', () => {
    expect(rangeText('2026-07-05', '2026-10-03')).toBe('5 Jul to 3 Oct');
    expect(rangeText('2025-12-20', '2026-01-03')).toBe('20 Dec 2025 to 3 Jan 2026');
  });
  it('gives the row date in India time', () => {
    expect(lineDay('2026-10-31T18:30:00Z')).toBe('1 Nov');
  });
  it('builds a preset ending today in India time', () => {
    expect(presetRange(30, new Date('2026-10-03T20:00:00Z'))).toEqual({ from: '2026-09-05', to: '2026-10-04' });
  });
  it('checks days', () => {
    expect(isDay('2026-02-30')).toBe(false);
    expect(isDay('2026-09-16')).toBe(true);
  });
  it('maps a 400 to the range message', () => {
    expect(statementErrorMessage(new ApiError({ code: 'VALIDATION_ERROR', message: 'x', status: 400 })))
      .toBe('Choose a range of up to a year');
    expect(statementErrorMessage(new Error('x'))).toBe('Could not load your statement.');
  });
  it('builds the wallet and order routes', () => {
    expect(walletEntryRoute(192)).toBe('/restaurant/wallet/transaction/192');
    expect(orderRoute(5)).toBe('/restaurant/orders/5');
  });
});

describe('methodLabel', () => {
  it('words the known methods and sentence-cases the rest', () => {
    expect(methodLabel('upi')).toBe('UPI');
    expect(methodLabel('BANK_TRANSFER')).toBe('Bank transfer');
  });
});
