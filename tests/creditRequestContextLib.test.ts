import {
  contextLines, historyLines, usualTerms, usualTermsPreview, offerWording, waitingWording, oldestFirst, DECLINE_REASONS,
} from '@/lib/credit/requestContext';
import type { RequestContext } from '@/models/creditRequest';

const ctx = (over: Partial<RequestContext> = {}): RequestContext => ({
  agreementId: 1, status: 'REQUESTED', outletId: 9, outletName: 'Outlet', restaurantName: 'Spice Co', asOf: '2026-10-06',
  windowDays: 90, ordersCount90d: 12, ordersValue90d: '84000.0000', averageOrderValue: '7000.00', cancelledOrders90d: 1,
  firstOrderDate: '2026-06-28', lastOrderDate: '2026-10-06', previousOverdueCount: 0, pastLineStatus: 'CLOSED',
  pastLineEndedAt: '2026-10-05T10:00:00Z', history: [], ...over,
});

describe('contextLines', () => {
  it('words every server field as sent, no arithmetic', () => {
    const lines = contextLines(ctx({ previousOverdueCount: 1 }));
    expect(lines.orders).toBe('Ordered 12 times in the last 90 days, ₹84,000 in total (average ₹7,000).');
    expect(lines.dates).toBe('First order 28 Jun, last 6 Oct.');
    expect(lines.cancelled).toBe('1 cancelled order.');
    expect(lines.overdue).toBe('1 earlier invoice of theirs with you went overdue.');
    expect(lines.past).toBe('Earlier credit line with you was closed on 5 Oct.');
  });

  it('shows the server text for money, not a figure of its own', () => {
    // 3 orders worth 100 must never be shown as an average of 33.33: the server's 99.99 wins.
    const lines = contextLines(ctx({ ordersCount90d: 3, ordersValue90d: '100.0000', averageOrderValue: '99.99' }));
    expect(lines.orders).toContain('₹100 in total (average ₹99.99)');
  });

  it('says there are no orders, and leaves out the dates and the average', () => {
    const lines = contextLines(ctx({
      ordersCount90d: 0, ordersValue90d: '0.0000', averageOrderValue: null, cancelledOrders90d: 0,
      firstOrderDate: null, lastOrderDate: null, pastLineStatus: null, pastLineEndedAt: null,
    }));
    expect(lines.orders).toBe('No orders with you yet');
    expect(lines.dates).toBeNull();
    expect(lines.cancelled).toBeNull();
    expect(lines.overdue).toBeNull();
    expect(lines.past).toBeNull();
  });

  it('uses the singular for one order and a null average', () => {
    const lines = contextLines(ctx({ ordersCount90d: 1, averageOrderValue: null, cancelledOrders90d: 2 }));
    expect(lines.orders).toBe('Ordered 1 time in the last 90 days, ₹84,000 in total.');
    expect(lines.cancelled).toBe('2 cancelled orders.');
  });

  it('names how an earlier line ended', () => {
    expect(contextLines(ctx({ pastLineStatus: 'REJECTED' })).past).toBe('You declined an earlier request on 5 Oct.');
    expect(contextLines(ctx({ pastLineStatus: 'EXPIRED' })).past).toBe('An earlier offer to them expired on 5 Oct.');
    expect(contextLines(ctx({ pastLineStatus: 'CLOSED', pastLineEndedAt: null })).past)
      .toBe('Earlier credit line with you was closed.');
  });

  it('adds the year only when the date is not this year', () => {
    expect(contextLines(ctx({ firstOrderDate: '2025-12-30' })).dates).toBe('First order 30 Dec 2025, last 6 Oct.');
  });
});

describe('historyLines', () => {
  it('keeps the server order and words each event', () => {
    const rows = historyLines([
      { at: '2026-10-05T10:00:00Z', event: 'REJECTED', note: 'Not now' },
      { at: '2026-09-01T10:00:00Z', event: 'REQUESTED', note: null },
      { at: '2026-09-02T10:00:00Z', event: 'WEIRD', note: null },
    ]);
    expect(rows.map((r) => r.label)).toEqual(['Declined', 'Requested', 'Weird']);
    expect(rows[0]).toMatchObject({ note: 'Not now', when: '5th Oct 2026' });
  });
});

describe('usualTerms', () => {
  const policy = {
    supplierStoreId: 5, creditEnabled: true, defaultCreditLimit: 50000, defaultCreditPeriodDays: 30,
    defaultGracePeriodDays: 3, maxSingleOrderCredit: 10000, maxOverdueAmount: null,
  };
  it('is the policy defaults, as the approve body', () => {
    expect(usualTerms(policy)).toEqual({
      approvedLimit: '50000', creditPeriodDays: 30, gracePeriodDays: 3, maxSingleOrderCredit: '10000',
    });
  });
  it('is null without a limit or a period, or without a policy', () => {
    expect(usualTerms({ ...policy, defaultCreditLimit: null })).toBeNull();
    expect(usualTerms({ ...policy, defaultCreditLimit: 0 })).toBeNull();
    expect(usualTerms({ ...policy, defaultCreditPeriodDays: null })).toBeNull();
    expect(usualTerms(null)).toBeNull();
  });
  it('previews exactly the body', () => {
    expect(usualTermsPreview(usualTerms(policy)!)).toEqual([
      'Limit ₹50,000', 'Pay within 30 days', 'Grace 3 days', 'Per-order cap ₹10,000',
    ]);
  });
});

describe('request card wording', () => {
  it('offers: valid until, expired', () => {
    expect(offerWording({ status: 'APPROVED', offerExpiresOn: '2026-10-20' } as never))
      .toBe('Offer sent, waiting for the restaurant (valid until 20th Oct 2026)');
    expect(offerWording({ status: 'APPROVED', offerExpiresOn: null } as never))
      .toBe('Offer sent, waiting for the restaurant');
    expect(offerWording({ status: 'EXPIRED' } as never)).toBe('Offer expired');
    expect(offerWording({ status: 'REQUESTED' } as never)).toBeNull();
  });
  it('waiting is the server timestamp in words', () => {
    const now = new Date('2026-10-06T10:00:00Z');
    expect(waitingWording('2026-10-03T10:00:00Z', now)).toBe('Waiting 3 days');
    expect(waitingWording('2026-10-05T10:00:00Z', now)).toBe('Waiting 1 day');
    expect(waitingWording('2026-10-06T08:00:00Z', now)).toBe('Waiting 2 hrs');
    expect(waitingWording(null, now)).toBeNull();
  });
  it('sorts the oldest first and puts a missing date last', () => {
    const rows = [{ id: 1, t: '2026-10-05T00:00:00Z' }, { id: 2, t: '2026-10-01T00:00:00Z' }, { id: 3, t: null }];
    expect(oldestFirst(rows, (r) => r.t).map((r) => r.id)).toEqual([2, 1, 3]);
  });
});

it('has the four quick decline reasons', () => {
  expect(DECLINE_REASONS).toEqual([
    'Not enough order history', 'Limit not available now', 'Prefer to be paid upfront', 'Other',
  ]);
});
