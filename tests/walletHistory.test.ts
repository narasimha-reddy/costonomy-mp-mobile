import {
  NO_FILTERS,
  buildTransactionsQuery,
  canApply,
  categoryLabel,
  entryKey,
  filterCount,
  filterReducer,
  filtersFromParams,
  filtersToParams,
  groupEntriesByMonth,
  hasInstruments,
  istMonthKey,
  matchesInstruments,
  mergeMonthTotals,
  mergePages,
  monthChoices,
  monthSpentLabel,
  monthTitle,
  presentEntry,
  relativeTime,
} from '@/lib/wallet/history';
import type { WalletEntry, WalletFilters } from '@/models/wallet';

function entry(id: number, over: Partial<WalletEntry> = {}): WalletEntry {
  return {
    id, direction: 'DEBIT', kind: 'ORDER_PAYMENT', amount: '100.0000', balanceAfter: '900.0000',
    supplierOrderId: null, reason: null, refundStatus: null, at: '2026-09-10T10:00:00Z', ...over,
  };
}

describe('istMonthKey', () => {
  it('cuts the month at India midnight, not UTC', () => {
    expect(istMonthKey('2026-09-30T19:00:00Z')).toBe('2026-10');
    expect(istMonthKey('2026-09-30T18:29:59Z')).toBe('2026-09');
    expect(istMonthKey('2026-09-30T18:30:00Z')).toBe('2026-10');
    expect(istMonthKey('2026-12-31T20:00:00Z')).toBe('2027-01');
  });

  it('is null for anything that is not a time', () => {
    expect(istMonthKey('nonsense')).toBeNull();
    expect(istMonthKey('')).toBeNull();
    expect(istMonthKey(null)).toBeNull();
  });
});

describe('monthTitle', () => {
  it('spells the month', () => {
    expect(monthTitle('2026-09')).toBe('September 2026');
    expect(monthTitle('2027-01')).toBe('January 2027');
  });
  it('calls an unreadable month Earlier', () => {
    expect(monthTitle('')).toBe('Earlier');
    expect(monthTitle('2026-13')).toBe('Earlier');
  });
});

describe('groupEntriesByMonth', () => {
  it('puts a 19:00Z 30 September entry under October, newest month first', () => {
    const groups = groupEntriesByMonth([
      entry(1, { at: '2026-09-30T19:00:00Z' }),
      entry(2, { at: '2026-09-30T10:00:00Z' }),
      entry(3, { at: '2026-08-31T20:00:00Z' }),
    ]);
    expect(groups.map((g) => [g.month, g.entries.map((e) => e.id)])).toEqual([
      ['2026-10', [1]], ['2026-09', [2, 3]],
    ]);
  });

  it('keeps an entry with no readable time, last', () => {
    const groups = groupEntriesByMonth([entry(1, { at: 'x' }), entry(2)]);
    expect(groups.map((g) => g.month)).toEqual(['2026-09', '']);
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-09-29T12:00:00Z');
  it('says how long ago', () => {
    expect(relativeTime('2026-09-28T12:00:00Z', now)).toBe('1 day ago');
    expect(relativeTime('2026-09-29T11:00:00Z', now)).toBe('1 hr ago');
    expect(relativeTime('2026-09-29T11:50:00Z', now)).toBe('10 mins ago');
    expect(relativeTime('2026-09-29T11:59:50Z', now)).toBe('just now');
    expect(relativeTime('2026-08-01T12:00:00Z', now)).toBe('2 months ago');
  });
  it('is empty for no time', () => {
    expect(relativeTime('nope', now)).toBe('');
    expect(relativeTime(undefined, now)).toBe('');
  });
});

describe('monthSpentLabel', () => {
  const totals = [
    { month: '2026-09', added: '0', spent: '1250.5000' },
    { month: '2026-08', added: '10', spent: '0' },
  ];
  it('shows the server total for the month', () => {
    expect(monthSpentLabel('2026-09', totals)).toBe('₹1,250.50');
    expect(monthSpentLabel('2026-08', totals)).toBe('₹0');
  });
  it('shows nothing when there is no total, or the list is narrowed client-side', () => {
    expect(monthSpentLabel('2026-07', totals)).toBeNull();
    expect(monthSpentLabel('2026-09', [])).toBeNull();
    expect(monthSpentLabel('2026-09', totals, true)).toBeNull();
  });
});

describe('mergePages', () => {
  it('drops ids repeated across overlapping pages, keeping the first', () => {
    const merged = mergePages([
      { items: [entry(1), entry(2), entry(3)] },
      { items: [entry(3, { amount: '999' }), entry(4)] },
      { items: [entry(4), entry(5)] },
    ]);
    expect(merged.map((e) => e.id)).toEqual([1, 2, 3, 4, 5]);
    expect(merged[2]!.amount).toBe('100.0000');
  });
  it('is empty for no pages', () => {
    expect(mergePages([])).toEqual([]);
  });
  it('tells rows apart by key when ids repeat across sources', () => {
    const merged = mergePages([
      { items: [entry(5, { key: 'L5' }), entry(5, { key: 'T5' })] },
      { items: [entry(5, { key: 'T5' }), entry(6, { key: 'L6' })] },
    ]);
    expect(merged.map(entryKey)).toEqual(['L5', 'T5', 'L6']);
  });
});

describe('mergeMonthTotals', () => {
  it('keeps one total per month, the latest page winning', () => {
    const merged = mergeMonthTotals([
      { monthTotals: [{ month: '2026-09', added: '0', spent: '1' }] },
      { monthTotals: [{ month: '2026-09', added: '0', spent: '2' }, { month: '2026-08', added: '0', spent: '3' }] },
    ]);
    expect(merged).toEqual([
      { month: '2026-09', added: '0', spent: '2' }, { month: '2026-08', added: '0', spent: '3' },
    ]);
  });
});

describe('presentEntry', () => {
  it('a completed credit is +green, a completed debit is −plain', () => {
    expect(presentEntry(entry(1, { direction: 'CREDIT', kind: 'TOP_UP' })))
      .toMatchObject({ sign: '+', tone: 'credit', chip: null, category: 'Top-up', title: 'Money added' });
    expect(presentEntry(entry(2))).toMatchObject({ sign: '−', tone: 'debit', chip: null });
  });

  it('IN_PROGRESS keeps its sign and says On its way', () => {
    expect(presentEntry(entry(1, { status: 'IN_PROGRESS', kind: 'WITHDRAWAL' })))
      .toMatchObject({ sign: '−', chip: { label: 'On its way', tone: 'pending' } });
  });

  it('RETURNED is neutral with no sign, whichever way it went', () => {
    for (const direction of ['DEBIT', 'CREDIT'] as const) {
      expect(presentEntry(entry(1, { status: 'RETURNED', direction, kind: 'WITHDRAWAL' })))
        .toMatchObject({ sign: '', tone: 'neutral', chip: { label: 'Returned to your bank/card' } });
    }
  });

  it('FAILED is neutral with a Failed chip', () => {
    expect(presentEntry(entry(1, { status: 'FAILED' })))
      .toMatchObject({ tone: 'neutral', chip: { label: 'Failed', tone: 'danger' } });
  });

  it('a missing status is a completed row; a withdrawal still shows its refund progress', () => {
    expect(presentEntry(entry(1, { kind: 'WITHDRAWAL', refundStatus: 'NEEDS_REVIEW' })).chip)
      .not.toBeNull();
    expect(presentEntry(entry(2, { status: undefined })).chip).toBeNull();
  });

  it('says what it was paid with', () => {
    expect(presentEntry(entry(1, { kind: 'TOP_UP', direction: 'CREDIT', instrument: 'Card •1007' })).instrumentLine)
      .toBe('Debited from Card •1007');
    expect(presentEntry(entry(2, { kind: 'WITHDRAWAL', instrument: 'UPI' })).instrumentLine).toBe('Sent to UPI');
    expect(presentEntry(entry(3, { instrument: null })).instrumentLine).toBeNull();
    expect(presentEntry(entry(4, { instrument: '  ' })).instrumentLine).toBeNull();
  });
});

describe('categoryLabel', () => {
  it('groups kinds the way the filter does', () => {
    expect(categoryLabel('DISPUTE_REFUND')).toBe('Refund');
    expect(categoryLabel('ORDER_REFUND')).toBe('Refund');
    expect(categoryLabel('QUICKSCAN_RETURN')).toBe('Shop payment');
    expect(categoryLabel('SOMETHING_NEW')).toBe('Wallet');
  });
});

describe('filter reducer', () => {
  it('toggles a choice on and off', () => {
    let state = filterReducer(NO_FILTERS, { type: 'toggle', section: 'months', value: '2026-09' });
    expect(state.months).toEqual(['2026-09']);
    state = filterReducer(state, { type: 'toggle', section: 'categories', value: 'TOP_UP' });
    state = filterReducer(state, { type: 'toggle', section: 'months', value: '2026-08' });
    expect(state.months).toEqual(['2026-09', '2026-08']);
    state = filterReducer(state, { type: 'toggle', section: 'months', value: '2026-09' });
    expect(state.months).toEqual(['2026-08']);
    expect(filterCount(state)).toBe(2);
  });

  it('clear all empties every section', () => {
    const full: WalletFilters = {
      months: ['2026-09'], categories: ['TOP_UP'], instruments: ['UPI'], statuses: ['RETURNED'],
    };
    expect(filterReducer(full, { type: 'clear' })).toEqual(NO_FILTERS);
  });

  it('does not change the state it was given', () => {
    const before: WalletFilters = { ...NO_FILTERS, months: ['2026-09'] };
    filterReducer(before, { type: 'toggle', section: 'months', value: '2026-08' });
    expect(before.months).toEqual(['2026-09']);
  });
});

describe('canApply', () => {
  it('is off when nothing is chosen', () => {
    expect(canApply(NO_FILTERS)).toBe(false);
  });
  it('is on once something is chosen', () => {
    expect(canApply({ ...NO_FILTERS, statuses: ['RETURNED'] })).toBe(true);
  });
  it('stays on to take previously applied filters off', () => {
    expect(canApply(NO_FILTERS, { ...NO_FILTERS, months: ['2026-09'] })).toBe(true);
  });
});

describe('buildTransactionsQuery', () => {
  it('is empty with nothing to say', () => {
    expect(buildTransactionsQuery({})).toBe('');
    expect(buildTransactionsQuery({ filters: NO_FILTERS })).toBe('');
  });

  it('maps categories to API kinds, months newest first, statuses as they are', () => {
    const query = buildTransactionsQuery({
      filters: {
        months: ['2026-08', '2026-09'],
        categories: ['REFUND', 'TOP_UP', 'SHOP_PAYMENT'],
        instruments: ['CARD'],
        statuses: ['COMPLETED', 'IN_PROGRESS'],
      },
      cursor: null,
      size: 20,
    });
    expect(query).toBe(
      '?months=2026-09,2026-08'
      + '&kinds=TOP_UP,ORDER_REFUND,REFUND,DISPUTE_REFUND,QUICKSCAN_PAYMENT,QUICKSCAN_RETURN'
      + '&statuses=COMPLETED,IN_PROGRESS&size=20');
    expect(query).not.toContain('CARD');
  });

  it('escapes the cursor', () => {
    expect(buildTransactionsQuery({ cursor: 'a b&c=d/+', size: 5 }))
      .toBe('?cursor=a%20b%26c%3Dd%2F%2B&size=5');
  });
});

describe('filters in route params', () => {
  it('round-trips', () => {
    const filters: WalletFilters = {
      months: ['2026-09', '2026-08'], categories: ['TOP_UP'], instruments: ['UPI', 'CARD'], statuses: ['RETURNED'],
    };
    expect(filtersFromParams(filtersToParams(filters))).toEqual(filters);
  });
  it('drops empties and anything unrecognised', () => {
    expect(filtersToParams(NO_FILTERS)).toEqual({});
    expect(filtersFromParams({
      months: '2026-09,junk,2026-1', categories: 'TOP_UP,HACK', instruments: '', statuses: ['RETURNED,X'],
    })).toEqual({ months: ['2026-09'], categories: ['TOP_UP'], instruments: [], statuses: ['RETURNED'] });
    expect(filtersFromParams({})).toEqual(NO_FILTERS);
  });
});

describe('matchesInstruments', () => {
  it('matches everything when none is chosen', () => {
    expect(matchesInstruments(entry(1), [])).toBe(true);
  });
  it('matches on the instrument text prefix, case-insensitively', () => {
    expect(matchesInstruments(entry(1, { instrument: 'Card •1007' }), ['CARD'])).toBe(true);
    expect(matchesInstruments(entry(1, { instrument: 'UPI' }), ['CARD'])).toBe(false);
    expect(matchesInstruments(entry(1, { instrument: 'Net banking (HDFC)' }), ['NETBANKING'])).toBe(true);
    expect(matchesInstruments(entry(1, { instrument: 'netbanking' }), ['UPI', 'NETBANKING'])).toBe(true);
    expect(matchesInstruments(entry(1, { instrument: 'Debit Card' }), ['CARD'])).toBe(false);
  });
  it('matches payments made from the wallet (no instrument) for Wallet', () => {
    expect(matchesInstruments(entry(1, { kind: 'ORDER_PAYMENT', instrument: null }), ['WALLET'])).toBe(true);
    expect(matchesInstruments(entry(1, { kind: 'QUICKSCAN_PAYMENT' }), ['WALLET'])).toBe(true);
    expect(matchesInstruments(entry(1, { kind: 'ORDER_PAYMENT' }), ['CARD'])).toBe(false);
  });
  it('still matches an instrument text starting with wallet', () => {
    expect(matchesInstruments(entry(1, { kind: 'TOP_UP', instrument: 'Wallet' }), ['WALLET'])).toBe(true);
  });
  it('keeps a card top-up under Card and out of Wallet', () => {
    const topUp = entry(1, { kind: 'TOP_UP', direction: 'CREDIT', instrument: 'Card •1111' });
    expect(matchesInstruments(topUp, ['CARD'])).toBe(true);
    expect(matchesInstruments(topUp, ['WALLET'])).toBe(false);
  });
  it('does not match refunds back to the wallet or null-instrument non-wallet kinds', () => {
    for (const kind of ['WITHDRAWAL', 'ORDER_REFUND', 'REFUND', 'DISPUTE_REFUND', 'QUICKSCAN_RETURN'] as const) {
      expect(matchesInstruments(entry(1, { kind, instrument: null }), ['WALLET'])).toBe(false);
      expect(matchesInstruments(entry(1, { kind, instrument: null }), ['CARD', 'UPI', 'NETBANKING'])).toBe(false);
    }
  });
  it('combines: Card + Wallet matches both a card top-up and a wallet payment, not a UPI top-up', () => {
    const chosen: ('CARD' | 'WALLET')[] = ['CARD', 'WALLET'];
    expect(matchesInstruments(entry(1, { kind: 'TOP_UP', instrument: 'Card •1111' }), chosen)).toBe(true);
    expect(matchesInstruments(entry(2, { kind: 'QUICKSCAN_PAYMENT' }), chosen)).toBe(true);
    expect(matchesInstruments(entry(3, { kind: 'TOP_UP', instrument: 'UPI' }), chosen)).toBe(false);
  });
});

describe('hasInstruments', () => {
  it('is true if a row names one, or was paid from the wallet', () => {
    expect(hasInstruments([entry(1, { kind: 'WITHDRAWAL' }), entry(2, { kind: 'REFUND', instrument: null })])).toBe(false);
    expect(hasInstruments([entry(1, { kind: 'QUICKSCAN_PAYMENT' })])).toBe(true);
    expect(hasInstruments([entry(1), entry(2, { instrument: null })])).toBe(true);
    expect(hasInstruments([entry(1), entry(2, { instrument: 'UPI' })])).toBe(true);
    expect(hasInstruments([])).toBe(false);
  });
});

describe('monthChoices', () => {
  const now = new Date('2026-09-29T12:00:00Z');
  it('lists twelve months newest first, greying those with no data', () => {
    const choices = monthChoices(['2026-09', '2026-07'], [], now);
    expect(choices).toHaveLength(12);
    expect(choices[0]).toEqual({ month: '2026-09', label: 'September 2026', disabled: false });
    expect(choices[1]).toMatchObject({ month: '2026-08', disabled: true });
    expect(choices[2]).toMatchObject({ month: '2026-07', disabled: false });
    expect(choices[11]!.month).toBe('2025-10');
  });
  it('crosses the year boundary', () => {
    const early = monthChoices([], [], new Date('2027-01-15T12:00:00Z'), 3);
    expect(early.map((c) => c.month)).toEqual(['2027-01', '2026-12', '2026-11']);
  });
  it('adds an older month that has data, and keeps a ticked one live', () => {
    const choices = monthChoices(['2024-05'], ['2024-01'], now);
    expect(choices.find((c) => c.month === '2024-05')!.disabled).toBe(false);
    expect(choices.find((c) => c.month === '2024-01')!.disabled).toBe(false);
    expect(choices).toHaveLength(14);
  });
});
