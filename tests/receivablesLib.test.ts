import {
  AGEING_COPY, ageingSegments, barPercent, pendingActionView, restaurantLabel,
} from '@/lib/credit/receivables';
import type { Ageing } from '@/models/credit';

const bucket = (b: Ageing['buckets'][number]['bucket'], amount: number, invoiceCount: number) =>
  ({ bucket: b, amount, invoiceCount, restaurantCount: 1, topRestaurants: [] });
const ageing = (over: Partial<Ageing> = {}): Ageing => ({
  asOf: '2026-10-06', total: 1000,
  buckets: [bucket('CURRENT', 500, 1), bucket('D1_7', 250, 9), bucket('D8_30', 250, 9), bucket('D30_PLUS', 0, 0)],
  ...over,
});

describe('ageingSegments (drawing ratio only)', () => {
  it('sizes each bucket by its server amount over the server total', () => {
    expect(ageingSegments(ageing()).map((s) => s.percent)).toEqual([50, 25, 25, 0]);
  });
  it('ignores invoice counts', () => {
    const skewed = ageing({ buckets: [bucket('CURRENT', 500, 1), bucket('D1_7', 500, 99), bucket('D8_30', 0, 50), bucket('D30_PLUS', 0, 0)] });
    expect(ageingSegments(skewed).map((s) => s.percent)).toEqual([50, 50, 0, 0]);
  });
  it('keeps the four buckets in order', () => {
    expect(ageingSegments(ageing()).map((s) => s.bucket)).toEqual(['CURRENT', 'D1_7', 'D8_30', 'D30_PLUS']);
  });
  it('is all zero when nothing is owed, never NaN', () => {
    expect(ageingSegments(ageing({ total: 0, buckets: ageing().buckets.map((b) => ({ ...b, amount: 0 })) }))
      .map((s) => s.percent)).toEqual([0, 0, 0, 0]);
  });
  it('handles a crore-scale total', () => {
    const big = ageing({ total: 999999999.99, buckets: [bucket('CURRENT', 999999999.99, 3), bucket('D1_7', 0, 0), bucket('D8_30', 0, 0), bucket('D30_PLUS', 0, 0)] });
    expect(ageingSegments(big)[0]?.percent).toBe(100);
  });
});

describe('barPercent', () => {
  it('is the share clamped to 0..100', () => {
    expect(barPercent(25, 100)).toBe(25);
    expect(barPercent(150, 100)).toBe(100);
    expect(barPercent(-5, 100)).toBe(0);
  });
  it('is null when there is no whole to measure against', () => {
    expect(barPercent(10, 0)).toBeNull();
    expect(barPercent(null, 100)).toBeNull();
    expect(barPercent(10, null)).toBeNull();
  });
});

describe('pendingActionView', () => {
  it('words and routes each kind the server can send', () => {
    expect(pendingActionView({ kind: 'CLAIMS_WAITING', count: 2 })).toMatchObject({ label: '2 payments waiting for your OK', target: { route: '/supplier/credit/claims' } });
    expect(pendingActionView({ kind: 'CLAIMS_WAITING', count: 1 })?.label).toBe('1 payment waiting for your OK');
    expect(pendingActionView({ kind: 'REQUESTS_PENDING', count: 3 })).toMatchObject({ label: '3 new credit requests', target: { scroll: 'requests' } });
    expect(pendingActionView({ kind: 'OVERDUE_RESTAURANTS', count: 4 })).toMatchObject({ label: '4 restaurants overdue', target: { scroll: 'list', sort: 'overdue' } });
    expect(pendingActionView({ kind: 'LINE_AT_LIMIT', count: 1 })).toMatchObject({ label: '1 line at its limit', target: { scroll: 'list', sort: 'owed' } });
  });
  it('knows nothing of a kind it was not taught, and of a zero count', () => {
    expect(pendingActionView({ kind: 'SOMETHING_NEW' as never, count: 2 })).toBeNull();
    expect(pendingActionView({ kind: 'CLAIMS_WAITING', count: 0 })).toBeNull();
  });
});

describe('copy', () => {
  it('explains every ageing bucket in plain words', () => {
    expect(AGEING_COPY.CURRENT.line).toBe('Not due yet');
    expect(AGEING_COPY.D1_7.line).toBe('1 to 7 days late');
    expect(AGEING_COPY.D8_30.line).toBe('8 to 30 days late');
    expect(AGEING_COPY.D30_PLUS.line).toBe('More than 30 days late');
  });
  it('names a restaurant by outlet then restaurant', () => {
    expect(restaurantLabel({ outletName: 'HSR', restaurantName: 'Dosa House' })).toEqual({ primary: 'HSR', secondary: 'Dosa House' });
    expect(restaurantLabel({ outletName: null, restaurantName: 'Dosa House' })).toEqual({ primary: 'Dosa House', secondary: null });
    expect(restaurantLabel({ outletName: null, restaurantName: null })).toEqual({ primary: 'Restaurant', secondary: null });
  });
});
