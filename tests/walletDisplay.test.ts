import { groupEntriesByDay, limitMeter, splitBalance } from '@/lib/wallet/display';
import type { WalletEntry, WalletLimits } from '@/models/wallet';

const limits = (added: string, limit: string): WalletLimits => ({
  maxBalance: '200000.0000',
  monthlyTopUpLimit: limit,
  addedThisMonth: added,
  remainingThisMonth: '0',
  minTopUp: '10',
  maxTopUp: '50000',
});

describe('splitBalance', () => {
  it('splits rupees and paise with Indian grouping', () => {
    expect(splitBalance('145000.50')).toEqual({ negative: false, rupees: '1,45,000', paise: '50' });
    expect(splitBalance('0')).toEqual({ negative: false, rupees: '0', paise: '00' });
    expect(splitBalance('1234.5000')).toEqual({ negative: false, rupees: '1,234', paise: '50' });
    expect(splitBalance(99.99)).toEqual({ negative: false, rupees: '99', paise: '99' });
  });

  it('carries a negative sign separately', () => {
    expect(splitBalance('-25.00')).toEqual({ negative: true, rupees: '25', paise: '00' });
  });

  it('is null for anything that is not a number, never NaN', () => {
    expect(splitBalance(null)).toBeNull();
    expect(splitBalance(undefined)).toBeNull();
    expect(splitBalance('')).toBeNull();
    expect(splitBalance('abc')).toBeNull();
  });
});

describe('limitMeter', () => {
  it('is null when limits are absent', () => {
    expect(limitMeter(undefined)).toBeNull();
    expect(limitMeter(null)).toBeNull();
  });

  it('is the share of the limit added', () => {
    const m = limitMeter(limits('25000.0000', '100000.0000'));
    expect(m?.percent).toBe(25);
    expect(m?.added).toBe('₹25,000');
    expect(m?.limit).toBe('₹1,00,000');
  });

  it('clamps to 100 when more than the limit was added', () => {
    expect(limitMeter(limits('150000', '100000'))?.percent).toBe(100);
  });

  it('clamps to 0 for nothing or a negative figure', () => {
    expect(limitMeter(limits('0', '100000'))?.percent).toBe(0);
    expect(limitMeter(limits('-5', '100000'))?.percent).toBe(0);
  });

  it('handles a limit of zero without dividing by it', () => {
    expect(limitMeter(limits('0', '0'))?.percent).toBe(0);
    expect(limitMeter(limits('10', '0'))?.percent).toBe(100);
    expect(limitMeter(limits('10', '-1'))?.percent).toBe(100);
  });

  it('is null for unreadable figures', () => {
    expect(limitMeter(limits('abc', '100'))).toBeNull();
    expect(limitMeter(limits('1', 'NaN'))).toBeNull();
  });
});

function entry(id: number, at: string): WalletEntry {
  return {
    id, direction: 'CREDIT', kind: 'TOP_UP', amount: '1', balanceAfter: '1',
    supplierOrderId: null, reason: null, refundStatus: null, at,
  };
}

describe('groupEntriesByDay', () => {
  it('groups by local day, newest day first, keeping entry order', () => {
    const groups = groupEntriesByDay([
      entry(3, '2026-09-29T12:00:00'), entry(2, '2026-09-29T09:00:00'), entry(1, '2026-09-27T09:00:00'),
    ]);
    expect(groups.map((g) => g.day)).toEqual(['2026-09-29', '2026-09-27']);
    expect(groups[0]?.entries.map((e) => e.id)).toEqual([3, 2]);
  });

  it('keeps entries with an unreadable time, last', () => {
    const groups = groupEntriesByDay([entry(1, 'nonsense'), entry(2, '2026-09-29T09:00:00')]);
    expect(groups.map((g) => g.day)).toEqual(['2026-09-29', '']);
    expect(groups[1]?.entries).toHaveLength(1);
  });

  it('is empty for no entries', () => {
    expect(groupEntriesByDay([])).toEqual([]);
  });
});
