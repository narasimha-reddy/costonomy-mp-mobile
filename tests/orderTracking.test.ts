import { etaCopy, initials, orderTrackingView, stageIndex, stagesFor, stepTimesFromTimeline } from '@/lib/delivery/orderTracking';
import type { DeliveryStatus } from '@/models/delivery';

const ALL: DeliveryStatus[] = [
  'DELIVERY_REQUESTED', 'QUOTE_RECEIVED', 'PROVIDER_SELECTED', 'DRIVER_ASSIGNED', 'DRIVER_AT_PICKUP', 'PICKED_UP',
  'IN_TRANSIT', 'ARRIVED_AT_DESTINATION', 'DELIVERED', 'QUOTE_FAILED', 'PROVIDER_UNAVAILABLE', 'DRIVER_CANCELLED',
  'PICKUP_FAILED', 'DELIVERY_FAILED', 'CANCELLED',
];
const PARTNER_PHASE = ['DRIVER_ASSIGNED', 'DRIVER_AT_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_DESTINATION'];
const RETRYABLE = ['QUOTE_FAILED', 'PROVIDER_UNAVAILABLE', 'DRIVER_CANCELLED', 'PICKUP_FAILED'];
const NOW = Date.parse('2026-01-01T10:00:00Z');
const REASON = 'Rider app timed out at gate 4';

const order = (deliveryMode: any, status: any = 'READY_FOR_PICKUP') => ({
  status, deliveryMode, orderNumber: 'ORD-77', supplierName: 'Fresh Farms', storeName: 'Fresh Farms HSR',
  outletName: 'Cafe Mocha', cancellationReason: 'Out of stock',
});
const delivery = (status: DeliveryStatus, extra: object = {}, mode: any = 'COSTONOMY') => ({
  status, mode, driverName: 'Ravi Kumar', driverPhone: '9999999999', trackable: mode === 'COSTONOMY',
  location: { latitude: '12.9', longitude: '77.6', bearing: null, recordedAt: '2026-01-01T09:59:00Z' },
  failureReason: REASON, etaMinutes: null, estimatedArrivalAt: null, ...extra,
});

describe('stagesFor', () => {
  it('has 7 steps for Costonomy delivery, 5 for the supplier, 3 for pickup', () => {
    expect(stagesFor('COSTONOMY_DELIVERY', 'COSTONOMY').map((s) => s.label)).toEqual(
      ['Confirmed', 'Preparing', 'Ready', 'Partner', 'Picked up', 'On the way', 'Delivered']);
    expect(stagesFor('COSTONOMY_DELIVERY')[3]?.longLabel).toBe('Partner assigned');
    expect(stagesFor('SUPPLIER_DELIVERY')).toHaveLength(5);
    expect(stagesFor('COSTONOMY_DELIVERY', 'SUPPLIER_OWN')).toHaveLength(5);
    expect(stagesFor('PICKUP').map((s) => s.longLabel)).toEqual(['Confirmed', 'Preparing', 'Ready to collect']);
  });
});

describe('stageIndex', () => {
  it('takes the higher of order and delivery status', () => {
    expect(stageIndex('CONFIRMED', null)).toBe(0);
    expect(stageIndex('PREPARING', null)).toBe(1);
    expect(stageIndex('READY_FOR_PICKUP', 'DRIVER_ASSIGNED')).toBe(3);
    expect(stageIndex('READY_FOR_PICKUP', 'PICKED_UP')).toBe(4);
    expect(stageIndex('OUT_FOR_DELIVERY', 'DRIVER_ASSIGNED')).toBe(5);
    expect(stageIndex('OUT_FOR_DELIVERY', 'ARRIVED_AT_DESTINATION')).toBe(5);
    expect(stageIndex('COMPLETED', null)).toBe(6);
    expect(stageIndex('PREPARING', 'QUOTE_FAILED')).toBe(2);
  });
});

describe('etaCopy', () => {
  it('counts down from the arrival time and flags an overdue one', () => {
    expect(etaCopy(new Date(NOW + 12 * 60000).toISOString(), 99, NOW)).toEqual({ text: 'Arriving in 12 mins', overdue: false });
    expect(etaCopy(new Date(NOW + 30000).toISOString(), null, NOW).text).toBe('Arriving in 1 min');
    expect(etaCopy(new Date(NOW - 60000).toISOString(), 5, NOW)).toEqual({ text: 'Running a little late', overdue: true });
  });
  it('falls back to etaMinutes, then to nothing', () => {
    expect(etaCopy(null, 7, NOW)).toEqual({ text: 'Arriving in 7 mins', overdue: false });
    expect(etaCopy(null, null, NOW)).toEqual({ text: null, overdue: false });
  });
});

describe('initials', () => {
  it('takes first and last initial and survives empty', () => {
    expect(initials('Ravi Kumar')).toBe('RK');
    expect(initials('madonna')).toBe('M');
    expect(initials('  ')).toBe('?');
    expect(initials(null)).toBe('?');
  });
});

describe('orderTrackingView, every delivery status x mode x audience', () => {
  const modes = [
    ['COSTONOMY_DELIVERY', 'COSTONOMY'], ['SUPPLIER_DELIVERY', 'SUPPLIER_OWN'], ['PICKUP', 'COSTONOMY'],
  ] as const;
  const cases = ALL.flatMap((status) => modes.flatMap(([orderMode, dMode]) =>
    (['buyer', 'supplier'] as const).map((audience) => [status, orderMode, dMode, audience] as const)));

  it.each(cases)('%s / %s / %s', (status, orderMode, dMode, audience) => {
    const view = orderTrackingView({
      audience, order: order(orderMode), delivery: delivery(status, {}, dMode), nowMs: NOW,
    });
    expect(view.headline.length).toBeGreaterThan(0);
    expect(view.currentIndex).toBeGreaterThanOrEqual(0);
    expect(view.currentIndex).toBeLessThan(view.steps.length);
    expect(view.steps).toHaveLength(orderMode === 'PICKUP' ? 3 : orderMode === 'SUPPLIER_DELIVERY' ? 5 : 7);
    // Track only in the partner phase, and only when trackable.
    expect(view.showTrack).toBe(PARTNER_PHASE.includes(status) && dMode === 'COSTONOMY');
    expect(view.showMap).toBe(view.showTrack);
    expect(view.showPartner).toBe(PARTNER_PHASE.includes(status));
    // Nothing the buyer reads may carry the raw failure reason or a provider name.
    if (audience === 'buyer') {
      expect(`${view.headline} ${view.subline}`).not.toContain(REASON);
      expect(`${view.headline} ${view.subline}`.toLowerCase()).not.toContain('pidge');
    }
    // Failure panel only for retryable partner failures and DELIVERY_FAILED.
    const retryable = RETRYABLE.includes(status) && dMode === 'COSTONOMY';
    expect(view.showFailure).toBe(retryable || status === 'DELIVERY_FAILED');
    expect(view.problem).toBe(status === 'DELIVERY_FAILED' ? 'danger' : retryable ? 'warning' : null);
    expect(view.complete).toBe(status === 'DELIVERED');
    if (status === 'DELIVERED') expect(view.currentIndex).toBe(view.steps.length - 1);
  });

  it('indexes the Costonomy journey from the delivery status', () => {
    const idx = (s: DeliveryStatus) => orderTrackingView({
      audience: 'buyer', order: order('COSTONOMY_DELIVERY'), delivery: delivery(s), nowMs: NOW,
    }).currentIndex;
    expect(idx('DELIVERY_REQUESTED')).toBe(2);
    expect(idx('QUOTE_FAILED')).toBe(2);
    expect(idx('DRIVER_ASSIGNED')).toBe(3);
    expect(idx('DRIVER_AT_PICKUP')).toBe(3);
    expect(idx('PICKED_UP')).toBe(4);
    expect(idx('IN_TRANSIT')).toBe(5);
    expect(idx('ARRIVED_AT_DESTINATION')).toBe(5);
    expect(idx('DELIVERED')).toBe(6);
  });

  it('keeps a failed delivery on the last step reached', () => {
    const v = orderTrackingView({
      audience: 'supplier', order: order('COSTONOMY_DELIVERY', 'OUT_FOR_DELIVERY'),
      delivery: delivery('DELIVERY_FAILED', { pickedUpAt: '2026-01-01T09:00:00Z' }), nowMs: NOW,
    });
    expect(v.currentIndex).toBe(5);
    expect(v.problem).toBe('danger');
    expect(v.subline).toBe(REASON);
  });

  it('gives the supplier the reason and the buyer calm copy for a retryable failure', () => {
    const sup = orderTrackingView({ audience: 'supplier', order: order('COSTONOMY_DELIVERY'), delivery: delivery('QUOTE_FAILED'), nowMs: NOW });
    const buy = orderTrackingView({ audience: 'buyer', order: order('COSTONOMY_DELIVERY'), delivery: delivery('QUOTE_FAILED'), nowMs: NOW });
    expect(sup.headline).toBe('No partner found yet');
    expect(sup.subline).toBe(REASON);
    expect(buy.headline).toBe('Still arranging delivery');
    expect(buy.tone).toBe('warning');
  });

  it('shows no map without a location, and a call button only with a phone', () => {
    const v = orderTrackingView({
      audience: 'buyer', order: order('COSTONOMY_DELIVERY'),
      delivery: delivery('IN_TRANSIT', { location: null, driverPhone: null }), nowMs: NOW,
    });
    expect(v.showTrack).toBe(true);
    expect(v.showMap).toBe(false);
    expect(v.showCall).toBe(false);
  });

  it('keeps the map for a stale location', () => {
    const v = orderTrackingView({
      audience: 'buyer', order: order('COSTONOMY_DELIVERY'),
      delivery: delivery('IN_TRANSIT', { locationStale: true }), nowMs: NOW,
    });
    expect(v.showMap).toBe(true);
  });

  it('counts down the ETA, then says it is running late', () => {
    const eta = (offsetMs: number, audience: 'buyer' | 'supplier') => orderTrackingView({
      audience, order: order('COSTONOMY_DELIVERY'),
      delivery: delivery('IN_TRANSIT', { estimatedArrivalAt: new Date(NOW + offsetMs).toISOString() }), nowMs: NOW,
    });
    expect(eta(9 * 60000, 'buyer').headline).toBe('Arriving in 9 mins');
    expect(eta(9 * 60000, 'supplier').subline).toBe('Arriving at Cafe Mocha in 9 mins.');
    const late = eta(-60000, 'buyer');
    expect(late.headline).toBe('Running a little late');
    expect(late.tone).toBe('warning');
    expect(late.subline).toMatch(/^Expected by \d+:\d\d (AM|PM)\./);
  });

  it('uses searching bars: indeterminate for the buyer, determinate for the supplier', () => {
    const v = (audience: 'buyer' | 'supplier') => orderTrackingView({
      audience, order: order('COSTONOMY_DELIVERY'), delivery: delivery('PROVIDER_SELECTED', { driverName: null }), nowMs: NOW,
    });
    expect(v('buyer').search).toBe('indeterminate');
    expect(v('supplier').search).toBe('determinate');
    expect(v('buyer').headline).toBe('Finding a delivery partner');
  });

  it('hides the stepper for CANCELLED and DRAFT orders', () => {
    const cancelled = orderTrackingView({ audience: 'buyer', order: order('COSTONOMY_DELIVERY', 'CANCELLED'), delivery: null, nowMs: NOW });
    expect(cancelled.steps).toEqual([]);
    expect(cancelled.headline).toBe('Order cancelled');
    expect(cancelled.subline).toBe('Out of stock');
    const draft = orderTrackingView({ audience: 'buyer', order: order('COSTONOMY_DELIVERY', 'DRAFT'), delivery: null, nowMs: NOW });
    expect(draft.steps).toEqual([]);
    expect(draft.headline).toBe('Payment incomplete');
    expect(draft.subline).toBe('Pay to send this order to Fresh Farms.');
  });

  it('covers order-only states without a delivery', () => {
    const v = (status: any, mode: any, audience: 'buyer' | 'supplier' = 'buyer') =>
      orderTrackingView({ audience, order: order(mode, status), delivery: null, nowMs: NOW });
    expect(v('CONFIRMED', 'COSTONOMY_DELIVERY').currentIndex).toBe(0);
    expect(v('PREPARING', 'COSTONOMY_DELIVERY', 'supplier').headline).toBe('Preparing');
    expect(v('READY_FOR_PICKUP', 'COSTONOMY_DELIVERY').headline).toBe('Finding a delivery partner');
    expect(v('READY_FOR_PICKUP', 'COSTONOMY_DELIVERY', 'supplier').headline).toBe('Ready to send');
    expect(v('READY_FOR_PICKUP', 'PICKUP').headline).toBe('Ready to collect');
    expect(v('READY_FOR_PICKUP', 'PICKUP').showReceive).toBe(true);
    expect(v('READY_FOR_PICKUP', 'PICKUP', 'supplier').headline).toBe('Waiting for collection');
    expect(v('OUT_FOR_DELIVERY', 'SUPPLIER_DELIVERY').subline).toBe('Fresh Farms is delivering this themselves. No live tracking.');
    expect(v('OUT_FOR_DELIVERY', 'SUPPLIER_DELIVERY').currentIndex).toBe(3);
    expect(v('COMPLETED', 'COSTONOMY_DELIVERY').headline).toBe('Order completed');
    expect(v('COMPLETED', 'COSTONOMY_DELIVERY').showReceive).toBe(false);
    expect(v('DELIVERED', 'SUPPLIER_DELIVERY').showReceive).toBe(true);
    expect(v('DELIVERED', 'SUPPLIER_DELIVERY', 'supplier').showReceive).toBe(false);
  });
});

describe('stepTimesFromTimeline', () => {
  it('maps the first event for each step to a clock time', () => {
    const times = stepTimesFromTimeline([
      { status: 'DRIVER_ASSIGNED', occurredAt: '2026-01-01T10:05:00' },
      { status: 'DRIVER_ASSIGNED', occurredAt: '2026-01-01T10:09:00' },
      { status: 'IN_TRANSIT', occurredAt: '2026-01-01T13:30:00' },
      { status: 'DRIVER_AT_PICKUP', occurredAt: '2026-01-01T10:20:00' },
    ]);
    expect(times).toEqual({ partner: '10:05 AM', on_the_way: '1:30 PM' });
    expect(stepTimesFromTimeline(null)).toEqual({});
  });
});
