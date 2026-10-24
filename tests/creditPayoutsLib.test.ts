import {
  PAYOUT_EXPLANATION, feeLine, groupPayouts, payoutFiltersFromParams, payoutFiltersToParams,
  payoutRange, payoutReducer, NO_PAYOUT_FILTERS, paymentSourceLabel,
} from '@/lib/credit/payouts';
import type { CreditPayout } from '@/models/credit';

const item = (id: number, o: Partial<CreditPayout> = {}): CreditPayout => ({
  payoutId: id, repaymentId: id, agreementId: 1, outletId: 2, outletName: 'HSR', restaurantName: 'Spice Co',
  grossAmount: '1000.0000', commissionRatePercent: '2.5000', commissionAmount: '25.0000', netAmount: '975.0000',
  status: 'PENDING', settlementId: null, settlementNumber: null, settlementDate: null, appliedAt: null,
  createdAt: '2026-10-01T05:00:00Z', invoices: [], ...o,
});

describe('groupPayouts', () => {
  it('groups by the status the server sent, Pending first', () => {
    const groups = groupPayouts([item(1, { status: 'APPLIED' }), item(2), item(3, { status: 'APPLIED' })]);
    expect(groups.map((g) => [g.title, g.items.map((i) => i.payoutId)])).toEqual([
      ['Pending', [2]], ['Paid out', [1, 3]],
    ]);
  });
  it('leaves out a group with nothing in it', () => {
    expect(groupPayouts([item(1)]).map((g) => g.title)).toEqual(['Pending']);
    expect(groupPayouts([])).toEqual([]);
  });
});

describe('feeLine', () => {
  it('says the fee and its rate', () => {
    expect(feeLine(item(1))).toBe('Mandi fee ₹25.00 (2.5%)');
  });
  it('drops the rate when there is none', () => {
    expect(feeLine(item(1, { commissionRatePercent: null }))).toBe('Mandi fee ₹25.00');
  });
  it('shows a zero fee as sent', () => {
    expect(feeLine(item(1, { commissionAmount: '0.0000', commissionRatePercent: '0.0000' }))).toBe('Mandi fee ₹0.00 (0%)');
  });
});

describe('filters', () => {
  it('has no date limit by default', () => {
    expect(payoutRange(NO_PAYOUT_FILTERS)).toBeNull();
  });
  it('turns a preset into India days ending today', () => {
    const now = new Date('2026-10-06T10:00:00Z');
    expect(payoutRange({ period: 'd30', months: [] }, now)).toEqual({ from: '2026-09-07', to: '2026-10-06' });
  });
  it('turns months into first and last day, cutting the running month at today', () => {
    const now = new Date('2026-10-06T10:00:00Z');
    expect(payoutRange({ period: null, months: ['2026-08', '2026-09'] }, now)).toEqual({ from: '2026-08-01', to: '2026-09-30' });
    expect(payoutRange({ period: null, months: ['2026-10'] }, now)).toEqual({ from: '2026-10-01', to: '2026-10-06' });
  });
  it('a preset replaces months, a month replaces the preset', () => {
    let s = payoutReducer(NO_PAYOUT_FILTERS, { type: 'toggle', value: '2026-09' });
    expect(s).toEqual({ period: null, months: ['2026-09'] });
    s = payoutReducer(s, { type: 'toggle', value: 'd90' });
    expect(s).toEqual({ period: 'd90', months: [] });
    s = payoutReducer(s, { type: 'toggle', value: 'd90' });
    expect(s).toEqual(NO_PAYOUT_FILTERS);
    expect(payoutReducer({ period: 'd30', months: [] }, { type: 'clear' })).toEqual(NO_PAYOUT_FILTERS);
  });
  it('round-trips through route params and drops junk', () => {
    expect(payoutFiltersFromParams(payoutFiltersToParams({ period: 'd90', months: [] }))).toEqual({ period: 'd90', months: [] });
    expect(payoutFiltersFromParams(payoutFiltersToParams({ period: null, months: ['2026-09', '2026-08'] })))
      .toEqual({ period: null, months: ['2026-08', '2026-09'] });
    expect(payoutFiltersFromParams({ period: 'zzz', months: 'bad,2026-13' })).toEqual(NO_PAYOUT_FILTERS);
  });
});

describe('words', () => {
  it('explains a pending payout plainly', () => {
    expect(PAYOUT_EXPLANATION).toBe(
      'This is money your restaurant paid from their Mandi wallet. We pay it to you in your next settlement.');
  });
  it('names where a payment came from', () => {
    expect(paymentSourceLabel('SUPPLIER_RECORDED')).toBe('Recorded by you');
    expect(paymentSourceLabel('CLAIM_CONFIRMED')).toBe('Confirmed from their claim');
    expect(paymentSourceLabel('WALLET')).toBe('Mandi wallet');
  });
});
