import { accountLine, entryLabel, instrumentName, rowLabel, rowTitle } from '@/lib/wallet/entryCopy';
import { formatRupees, monthNet } from '@/lib/wallet/history';
import type { WalletEntry } from '@/models/wallet';

const entry = (over: Record<string, unknown> = {}): WalletEntry => ({
  id: 1, direction: 'DEBIT', kind: 'ORDER_PAYMENT', amount: '500.0000', balanceAfter: '0.0000',
  supplierOrderId: null, reason: null, refundStatus: null, at: '2026-09-28T12:00:00Z', ...over,
} as WalletEntry);

describe('rowLabel', () => {
  it.each([
    ['TOP_UP', 'CREDIT', 'Added to wallet'],
    ['ORDER_PAYMENT', 'DEBIT', 'Paid to'],
    ['QUICKSCAN_PAYMENT', 'DEBIT', 'Paid to'],
    ['ORDER_REFUND', 'CREDIT', 'Refund from'],
    ['REFUND', 'CREDIT', 'Refund from'],
    ['DISPUTE_REFUND', 'CREDIT', 'Refund from'],
    ['WITHDRAWAL', 'DEBIT', 'Withdrawal to'],
    ['WITHDRAWAL_REVERSAL', 'CREDIT', 'Received from'],
    ['QUICKSCAN_RETURN', 'CREDIT', 'Received from'],
    ['CREDIT_REPAYMENT', 'DEBIT', 'Paid to'],
    ['SOMETHING_NEW', 'CREDIT', 'Received from'],
    ['SOMETHING_NEW', 'DEBIT', 'Paid to'],
  ])('%s %s reads "%s"', (kind, direction, text) => {
    expect(rowLabel(entry({ kind, direction }))).toBe(text);
  });
});

describe('instrumentName', () => {
  it('writes cards as "Card •••• 1007" however the server spelled the mask', () => {
    expect(instrumentName('Card •1007')).toBe('Card •••• 1007');
    expect(instrumentName('Card ****1007')).toBe('Card •••• 1007');
    expect(instrumentName('card 1007')).toBe('Card •••• 1007');
    expect(instrumentName('Card •••• 1007')).toBe('Card •••• 1007');
  });
  it('leaves anything else alone, and is null for nothing', () => {
    expect(instrumentName('UPI')).toBe('UPI');
    expect(instrumentName('  Netbanking ')).toBe('Netbanking');
    expect(instrumentName('')).toBeNull();
    expect(instrumentName(null)).toBeNull();
    expect(instrumentName(undefined)).toBeNull();
  });
});

describe('rowTitle: the best name the entry has', () => {
  it('a top-up is the card it came from, else "Wallet top-up"', () => {
    expect(rowTitle(entry({ kind: 'TOP_UP', instrument: 'Card •1007' }))).toBe('Card •••• 1007');
    expect(rowTitle(entry({ kind: 'TOP_UP', instrument: null }))).toBe('Wallet top-up');
  });
  it('an order payment is the order number in the reason, else the order id, else the reason', () => {
    expect(rowTitle(entry({ reason: 'Payment for MP-260919-000013' }))).toBe('Order MP-260919-000013');
    expect(rowTitle(entry({ supplierOrderId: 42, reason: 'wallet' }))).toBe('Order #42');
    expect(rowTitle(entry({ reason: 'Weekly vegetables' }))).toBe('Weekly vegetables');
    expect(rowTitle(entry())).toBe('Order payment');
  });
  it('refunds name the order, the reason, or the kind', () => {
    expect(rowTitle(entry({ kind: 'ORDER_REFUND', supplierOrderId: 7 }))).toBe('Order #7');
    expect(rowTitle(entry({ kind: 'ORDER_REFUND' }))).toBe('Cancelled order');
    expect(rowTitle(entry({ kind: 'REFUND', reason: 'Short delivery' }))).toBe('Short delivery');
    expect(rowTitle(entry({ kind: 'REFUND' }))).toBe('Refund');
    expect(rowTitle(entry({ kind: 'DISPUTE_REFUND' }))).toBe('Dispute refund');
  });
  it('a withdrawal is where it went; its reversal is "Returned withdrawal"', () => {
    expect(rowTitle(entry({ kind: 'WITHDRAWAL', instrument: 'Card •1007' }))).toBe('Card •••• 1007');
    expect(rowTitle(entry({ kind: 'WITHDRAWAL' }))).toBe('Card or bank');
    expect(rowTitle(entry({ kind: 'WITHDRAWAL_REVERSAL' }))).toBe('Returned withdrawal');
  });
  it('QuickScan is the reason text, else "QuickScan payment"', () => {
    expect(rowTitle(entry({ kind: 'QUICKSCAN_PAYMENT', reason: 'Sharma Dairy' }))).toBe('Sharma Dairy');
    expect(rowTitle(entry({ kind: 'QUICKSCAN_PAYMENT', reason: '  ' }))).toBe('QuickScan payment');
    expect(rowTitle(entry({ kind: 'QUICKSCAN_RETURN' }))).toBe('QuickScan payment');
  });
  it('an unknown kind says its reason, or what the direction shows', () => {
    expect(rowTitle(entry({ kind: 'NEW', reason: 'Something' }))).toBe('Something');
    expect(rowTitle(entry({ kind: 'NEW', direction: 'CREDIT' }))).toBe('Money in');
  });
});

describe('accountLine', () => {
  it('is always the wallet', () => {
    expect(accountLine(entry({ direction: 'DEBIT' }))).toBe('Debited from wallet');
    expect(accountLine(entry({ direction: 'CREDIT' }))).toBe('Credited to wallet');
  });
});

describe('formatRupees', () => {
  it('groups the Indian way and trims paise', () => {
    expect(formatRupees('49000.0000')).toBe('₹49,000');
    expect(formatRupees('123456')).toBe('₹1,23,456');
    expect(formatRupees('115.5000')).toBe('₹115.5');
    expect(formatRupees('74322.70')).toBe('₹74,322.7');
    expect(formatRupees('0')).toBe('₹0');
    expect(formatRupees(85)).toBe('₹85');
  });
  it('drops the sign and says "—" for nothing', () => {
    expect(formatRupees('-12.50')).toBe('₹12.5');
    expect(formatRupees(null)).toBe('—');
    expect(formatRupees('abc')).toBe('—');
  });
});

describe('monthNet', () => {
  const totals = [
    { month: '2026-10', added: '49000.0000', spent: '124.0000' },
    { month: '2026-09', added: '1000.0000', spent: '75322.7000' },
    { month: '2026-08', added: '500.0000', spent: '500.0000' },
    { month: '2026-07', added: '3594.3800', spent: '2767.6900' },
    { month: '2026-06', added: '0.0000', spent: '73.3100' },
  ];
  it('is "+ ₹…" in credit when the month ended ahead, with its money in and out', () => {
    expect(monthNet('2026-10', totals)).toMatchObject({ label: '+ ₹48,876', credit: true });
    expect(monthNet('2026-07', totals)).toEqual({
      label: '+ ₹826.69', credit: true, moneyIn: '₹3,594.38', moneyOut: '₹2,767.69' });
  });
  it('is "− ₹…" with a real minus sign, not in credit, when it ended behind', () => {
    const net = monthNet('2026-06', totals);
    expect(net).toMatchObject({ label: '\u2212 ₹73.31', credit: false, moneyIn: '₹0', moneyOut: '₹73.31' });
    expect(net?.label.startsWith('\u2212 ')).toBe(true);
    expect(monthNet('2026-09', totals)).toMatchObject({ label: '\u2212 ₹74,322.7', credit: false });
  });
  it('is the plain "₹0", not in credit, when level', () => {
    expect(monthNet('2026-08', totals)).toMatchObject({ label: '₹0', credit: false });
  });
  it('is exact: no float drift in the paise', () => {
    expect(monthNet('m', [{ month: 'm', added: '0.3000', spent: '0.1000' }]))
      .toMatchObject({ label: '+ ₹0.2', credit: true });
  });
  it('is null with no total, an unreadable one, or when the list is narrowed', () => {
    expect(monthNet('2025-01', totals)).toBeNull();
    expect(monthNet('m', [{ month: 'm', added: 'x', spent: '1' }])).toBeNull();
    expect(monthNet('2026-10', totals, true)).toBeNull();
  });
});

describe('CREDIT_REPAYMENT copy', () => {
  it('is labelled "Credit repayment" and titled with the server reason, else the same words', () => {
    expect(entryLabel(entry({ kind: 'CREDIT_REPAYMENT' }))).toBe('Credit repayment');
    expect(rowTitle(entry({ kind: 'CREDIT_REPAYMENT', reason: 'Credit repayment' }))).toBe('Credit repayment');
    expect(rowTitle(entry({ kind: 'CREDIT_REPAYMENT', reason: null }))).toBe('Credit repayment');
    expect(accountLine(entry({ kind: 'CREDIT_REPAYMENT' }))).toBe('Debited from wallet');
  });

  it('an unknown future kind still uses the direction fallback', () => {
    expect(entryLabel(entry({ kind: 'SOMETHING_NEW', direction: 'DEBIT' }))).toBe('Money out');
    expect(entryLabel(entry({ kind: 'SOMETHING_NEW', direction: 'CREDIT' }))).toBe('Money in');
    expect(rowTitle(entry({ kind: 'SOMETHING_NEW', direction: 'DEBIT', reason: null }))).toBe('Money out');
  });

  it('month net counts the server total as money out, like any other debit', () => {
    const totals = [{ month: '2026-09', added: '1000.0000', spent: '1500.0000' }];
    expect(monthNet('2026-09', totals)).toMatchObject({ label: '− ₹500', credit: false, moneyOut: '₹1,500' });
  });
});
