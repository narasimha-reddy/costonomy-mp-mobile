import { entryMatches, searchEntries } from '@/lib/wallet/search';
import type { WalletEntry } from '@/models/wallet';

const entry = (over: Record<string, unknown> = {}): WalletEntry => ({
  id: 1, direction: 'DEBIT', kind: 'ORDER_PAYMENT', amount: '500.0000', balanceAfter: '0.0000',
  supplierOrderId: null, reason: null, refundStatus: null, at: '2026-09-28T12:00:00Z', ...over,
} as WalletEntry);

const rows = [
  entry({ id: 1, reason: 'Order MP-260919-000013 payment', amount: '1250.5000' }),
  entry({ id: 2, kind: 'TOP_UP', direction: 'CREDIT', instrument: 'Card •1007', amount: '49000.0000' }),
  entry({ id: 3, kind: 'QUICKSCAN_PAYMENT', reason: 'Sharma Dairy', amount: '85.0000' }),
  entry({ id: 4, kind: 'WITHDRAWAL', instrument: 'UPI', amount: '2000.0000' }),
];
const ids = (list: WalletEntry[]) => list.map((e) => e.id);

describe('searchEntries', () => {
  it('keeps everything, in order, for an empty or blank query', () => {
    expect(searchEntries(rows, '')).toBe(rows);
    expect(searchEntries(rows, '   ')).toBe(rows);
  });

  it('matches the title, case-insensitively', () => {
    expect(ids(searchEntries(rows, 'sharma'))).toEqual([3]);
    expect(ids(searchEntries(rows, 'SHARMA DAIRY'))).toEqual([3]);
    expect(ids(searchEntries(rows, 'mp-260919'))).toEqual([1]);
    expect(ids(searchEntries(rows, 'card ••••'))).toEqual([2]);
  });

  it('matches the label, the reason and the instrument', () => {
    expect(ids(searchEntries(rows, 'added to'))).toEqual([2]);
    expect(ids(searchEntries(rows, 'withdrawal to'))).toEqual([4]);
    expect(ids(searchEntries(rows, 'payment'))).toEqual([1]);
    expect(ids(searchEntries(rows, 'upi'))).toEqual([4]);
    expect(ids(searchEntries(rows, '•1007'))).toEqual([2]);
  });

  it('collapses extra spaces in what was typed', () => {
    expect(ids(searchEntries(rows, '  sharma    dairy '))).toEqual([3]);
  });

  it('matches an amount typed with or without the rupee sign and commas', () => {
    expect(ids(searchEntries(rows, '49000'))).toEqual([2]);
    expect(ids(searchEntries(rows, '₹49,000'))).toEqual([2]);
    expect(ids(searchEntries(rows, '1,250.5'))).toEqual([1]);
    expect(ids(searchEntries(rows, '85'))).toEqual([3]);
    expect(ids(searchEntries(rows, 'rs 2000'))).toEqual([4]);
  });

  it('is an empty list when nothing matches', () => {
    expect(searchEntries(rows, 'zzz')).toEqual([]);
    expect(searchEntries(rows, '999999')).toEqual([]);
  });
});

describe('entryMatches', () => {
  it('does not match words against amounts', () => {
    expect(entryMatches(entry({ amount: '500' }), 'five')).toBe(false);
  });
});
