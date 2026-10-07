import { orderTrackingView } from '@/lib/delivery/orderTracking';
import { buyerTrackingHeader, placeholderCopy } from '@/lib/delivery/trackingHeader';
import type { DeliveryStatus } from '@/models/delivery';

const NOW = Date.parse('2026-01-01T10:00:00Z');
const DROP = { latitude: 12.9, longitude: 77.6 };
/** About `m` metres north of the drop (1 degree of latitude is roughly 111.2 km). */
const northOf = (m: number) => ({
  latitude: String(DROP.latitude + m / 111195), longitude: String(DROP.longitude), bearing: null,
  recordedAt: '2026-01-01T09:59:30Z',
});

const order = (deliveryMode: any, status: any, extra: object = {}) => ({
  status, deliveryMode, orderNumber: 'ORD-77', supplierName: 'Fresh Farms', storeName: 'Fresh Farms HSR',
  outletName: 'Cafe Mocha Outlet', cancellationReason: null, deliverySlotName: null, ...extra,
});
const delivery = (status: DeliveryStatus, extra: object = {}, mode: any = 'COSTONOMY') => ({
  status, mode, driverName: 'Ravi Kumar', driverPhone: '9999999999', trackable: mode === 'COSTONOMY',
  location: northOf(2000), locationStale: false, locationAgeSeconds: 10, failureReason: 'Rider app timed out',
  etaMinutes: null, estimatedArrivalAt: null, ...extra,
});

function head(o: any, d: any = null, drop: any = DROP) {
  const view = orderTrackingView({ audience: 'buyer', order: o, delivery: d, nowMs: NOW });
  return buyerTrackingHeader({ view, order: o, delivery: d, drop, nowMs: NOW });
}
const C = 'COSTONOMY_DELIVERY';

describe('buyerTrackingHeader state matrix', () => {
  it('cancelled', () => {
    const h = head(order(C, 'CANCELLED', { cancellationReason: 'Out of stock' }));
    expect(h).toMatchObject({
      state: 'cancelled', title: 'Order cancelled', tone: 'neutral', map: 'none', partner: 'none',
      pill: { text: 'Out of stock', tone: 'normal' },
    });
    const noReason = head(order(C, 'CANCELLED', { paymentStatus: 'RELEASED' }));
    expect(noReason.pill?.text).toBe('Released');
  });
  it('draft', () => {
    expect(head(order(C, 'DRAFT'))).toMatchObject({
      state: 'draft', title: 'Payment incomplete', tone: 'neutral', map: 'none', partner: 'none',
      pill: { text: 'Pay to send this order to Fresh Farms' },
    });
  });
  it('completed', () => {
    expect(head(order(C, 'COMPLETED'), delivery('DELIVERED'))).toMatchObject({
      state: 'completed', layout: 'receipt', pill: null, map: 'none', partner: 'none',
    });
  });
  it('delivered', () => {
    expect(head(order(C, 'OUT_FOR_DELIVERY'), delivery('DELIVERED'))).toMatchObject({
      state: 'delivered', layout: 'receipt', pill: null, map: 'none', partner: 'none',
    });
    expect(head(order(C, 'DELIVERED')).state).toBe('delivered');
  });
  it('failed', () => {
    expect(head(order(C, 'OUT_FOR_DELIVERY'), delivery('DELIVERY_FAILED'))).toMatchObject({
      state: 'failed', title: 'Delivery didn\'t go through', tone: 'neutral', map: 'none', partner: 'none',
      pill: { text: 'Your supplier and our team have been told.', tone: 'warning' },
    });
  });
  it('pickup_ready', () => {
    expect(head(order('PICKUP', 'READY_FOR_PICKUP'))).toMatchObject({
      state: 'pickup_ready', title: 'Ready to collect', map: 'none', partner: 'none',
      pill: { text: 'Pick up from Fresh Farms HSR' },
    });
    expect(head(order('PICKUP', 'READY_FOR_PICKUP', { storeName: null })).pill?.text).toBe('Pick up from Fresh Farms');
  });
  it('own_ready', () => {
    expect(head(order('SUPPLIER_DELIVERY', 'READY_FOR_PICKUP'))).toMatchObject({
      state: 'own_ready', title: 'Packed and ready', map: 'none', partner: 'none',
      pill: { text: 'Fresh Farms is delivering this. No live tracking.' },
    });
  });
  it('own_on_the_way', () => {
    expect(head(order('SUPPLIER_DELIVERY', 'OUT_FOR_DELIVERY'))).toMatchObject({
      state: 'own_on_the_way', title: 'On the way', map: 'none', partner: 'none',
      pill: { text: 'Fresh Farms is delivering this. No live tracking.' },
    });
  });
  it('placed', () => {
    expect(head(order(C, 'CONFIRMED'))).toMatchObject({
      state: 'placed', layout: 'placed', pill: null, map: 'none', partner: 'none',
    });
  });
  it('partner_changed', () => {
    const h = head(order(C, 'READY_FOR_PICKUP'), delivery('DRIVER_CANCELLED'));
    expect(h).toMatchObject({
      state: 'partner_changed', title: 'Finding a new delivery partner', map: 'pending', partner: 'placeholder',
      pill: { text: 'Usually takes 2 to 5 mins', tone: 'warning' },
    });
    expect(placeholderCopy(h.state, 'Fresh Farms')).toEqual({
      title: 'Your previous partner could not make it', body: 'A new partner is being assigned.',
    });
  });
  it('no_partner', () => {
    const h = head(order(C, 'READY_FOR_PICKUP'), delivery('QUOTE_FAILED'));
    expect(h).toMatchObject({
      state: 'no_partner', title: 'Still arranging delivery', map: 'pending', partner: 'placeholder',
      pill: { text: 'Partners are busy nearby. We\'ll update you here.', tone: 'warning' },
    });
    expect(placeholderCopy(h.state, 'Fresh Farms')).toEqual({
      title: 'Still arranging delivery', body: 'Your supplier is on it.',
    });
  });
  it('searching', () => {
    const h = head(order(C, 'READY_FOR_PICKUP'), delivery('PROVIDER_SELECTED', { driverName: null, location: null }));
    expect(h).toMatchObject({
      state: 'searching', title: 'Assigning a delivery partner', map: 'pending', partner: 'placeholder',
      progress: 'indeterminate', pill: { text: 'Usually takes 2 to 5 mins' },
    });
    expect(placeholderCopy(h.state, 'Fresh Farms')).toEqual({
      title: 'Finding a partner near Fresh Farms',
      body: 'We will show your delivery partner here as soon as one accepts.',
    });
    // Partner kind, READY, no delivery row yet, is the same state.
    expect(head(order(C, 'READY_FOR_PICKUP')).state).toBe('searching');
  });
  it('preparing', () => {
    const h = head(order(C, 'PREPARING'));
    expect(h).toMatchObject({
      state: 'preparing', title: 'Packing your order', map: 'pending', partner: 'placeholder', progress: null,
      pill: { text: 'We\'ll assign a delivery partner soon' },
    });
    expect(placeholderCopy(h.state, 'Fresh Farms')?.title).toBe('Assigning delivery partner shortly');
    expect(head(order(C, 'PREPARING', { deliverySlotName: '6-8 AM' })).pill?.text).toBe('Delivery window 6-8 AM');
    expect(head(order('PICKUP', 'PREPARING'))).toMatchObject({ state: 'preparing', map: 'none', partner: 'none' });
  });
  it('assigned', () => {
    expect(head(order(C, 'READY_FOR_PICKUP'), delivery('DRIVER_ASSIGNED'))).toMatchObject({
      state: 'assigned', title: 'Ravi is on the way to the supplier', map: 'live', partner: 'card',
      pill: { text: 'Your order will be picked up shortly' },
    });
  });
  it('at_pickup', () => {
    expect(head(order(C, 'READY_FOR_PICKUP'), delivery('DRIVER_AT_PICKUP'))).toMatchObject({
      state: 'at_pickup', title: 'Ravi is at the supplier', map: 'live', partner: 'card',
      pill: { text: 'Collecting your order' },
    });
  });
  it('reached', () => {
    expect(head(order(C, 'OUT_FOR_DELIVERY'), delivery('ARRIVED_AT_DESTINATION'))).toMatchObject({
      state: 'reached', title: 'Reached your location', map: 'reached', partner: 'card',
      pill: { text: 'Coming to your doorstep' },
    });
  });
  it('arriving', () => {
    expect(head(order(C, 'OUT_FOR_DELIVERY'), delivery('IN_TRANSIT', { location: northOf(200) }))).toMatchObject({
      state: 'arriving', title: 'Arriving now', map: 'arriving', partner: 'card',
      pill: { text: 'Be ready to collect your order' },
    });
  });
  it('on_the_way', () => {
    const h = head(order(C, 'OUT_FOR_DELIVERY'), delivery('IN_TRANSIT'));
    expect(h).toMatchObject({
      state: 'on_the_way', title: 'Order is on the way', map: 'live', partner: 'card', pill: { text: 'On the way' },
    });
    const eta = head(order(C, 'OUT_FOR_DELIVERY'), delivery('PICKED_UP', { etaMinutes: 12 }));
    expect(eta.pill?.text).toBe('Arriving in 12 mins · On time');
  });
});

describe('buyerTrackingHeader details', () => {
  it('stale subText', () => {
    const h = head(order(C, 'OUT_FOR_DELIVERY'), delivery('IN_TRANSIT', { locationStale: true, locationAgeSeconds: 300 }));
    expect(h.pill?.subText).toBe('Updated 5 min ago');
    const fresh = head(order(C, 'OUT_FOR_DELIVERY'), delivery('IN_TRANSIT', { locationStale: true, locationAgeSeconds: 10 }));
    expect(fresh.pill?.subText).toBe('Updated 1 min ago');
  });
  it('no location subText', () => {
    const h = head(order(C, 'READY_FOR_PICKUP'), delivery('DRIVER_ASSIGNED', { location: null }));
    expect(h.pill?.subText).toBe('Waiting for the partner\'s location');
    expect(head(order(C, 'READY_FOR_PICKUP'), delivery('DRIVER_ASSIGNED')).pill?.subText).toBeNull();
  });
  it('arriving by distance needs a fresh fix', () => {
    const near = { location: northOf(100) };
    expect(head(order(C, 'OUT_FOR_DELIVERY'), delivery('IN_TRANSIT', near)).state).toBe('arriving');
    expect(head(order(C, 'OUT_FOR_DELIVERY'), delivery('IN_TRANSIT', { ...near, locationStale: true })).state)
      .toBe('on_the_way');
    expect(head(order(C, 'OUT_FOR_DELIVERY'), delivery('IN_TRANSIT', { location: northOf(1000) })).state)
      .toBe('on_the_way');
    expect(head(order(C, 'OUT_FOR_DELIVERY'), delivery('IN_TRANSIT', near), null).state).toBe('on_the_way');
  });
  it('arriving by eta<=2', () => {
    expect(head(order(C, 'OUT_FOR_DELIVERY'), delivery('IN_TRANSIT', { etaMinutes: 2 })).state).toBe('arriving');
    expect(head(order(C, 'OUT_FOR_DELIVERY'), delivery('IN_TRANSIT', { etaMinutes: 3 })).state).toBe('on_the_way');
    // Even a stale fix: the eta rule does not need one.
    expect(head(order(C, 'OUT_FOR_DELIVERY'), delivery('IN_TRANSIT', { etaMinutes: 1, locationStale: true })).state)
      .toBe('arriving');
  });
  it('reached at 50m', () => {
    expect(head(order(C, 'OUT_FOR_DELIVERY'), delivery('IN_TRANSIT', { location: northOf(40) })).state).toBe('reached');
    expect(head(order(C, 'OUT_FOR_DELIVERY'), delivery('PICKED_UP', { location: northOf(80) })).state).toBe('arriving');
    expect(head(order(C, 'OUT_FOR_DELIVERY'), delivery('IN_TRANSIT', { location: northOf(40), locationStale: true })).state)
      .toBe('on_the_way');
  });
  it('overdue says Running late by N min', () => {
    const late = delivery('IN_TRANSIT', { estimatedArrivalAt: '2026-01-01T09:50:00Z', etaMinutes: 1 });
    const h = head(order(C, 'OUT_FOR_DELIVERY'), late);
    expect(h.pill).toMatchObject({ text: 'Running late by 10 min', tone: 'warning' });
    // Overdue is never "arriving" by eta.
    expect(h.state).toBe('on_the_way');
  });
  it('never names a provider', () => {
    const all = [
      head(order(C, 'CANCELLED')), head(order(C, 'DRAFT')), head(order(C, 'READY_FOR_PICKUP'), delivery('DRIVER_CANCELLED')),
      head(order(C, 'READY_FOR_PICKUP'), delivery('QUOTE_FAILED')), head(order(C, 'READY_FOR_PICKUP')),
      head(order(C, 'PREPARING')), head(order(C, 'READY_FOR_PICKUP'), delivery('DRIVER_ASSIGNED')),
      head(order(C, 'READY_FOR_PICKUP'), delivery('DRIVER_AT_PICKUP')),
      head(order(C, 'OUT_FOR_DELIVERY'), delivery('IN_TRANSIT')),
      head(order(C, 'OUT_FOR_DELIVERY'), delivery('DELIVERY_FAILED')),
      head(order(C, 'OUT_FOR_DELIVERY'), delivery('ARRIVED_AT_DESTINATION')),
    ];
    for (const h of all) {
      const text = JSON.stringify(h) + JSON.stringify(placeholderCopy(h.state, 'Fresh Farms'));
      expect(text).not.toMatch(/pidge|porter|borzo|shadowfax|mock/i);
    }
  });
  it('never says themselves for COSTONOMY', () => {
    const states = [
      head(order(C, 'PREPARING')), head(order(C, 'READY_FOR_PICKUP')),
      head(order(C, 'READY_FOR_PICKUP'), delivery('QUOTE_FAILED')),
      head(order(C, 'READY_FOR_PICKUP'), delivery('DRIVER_CANCELLED')),
      head(order(C, 'READY_FOR_PICKUP'), delivery('DRIVER_ASSIGNED')),
      head(order(C, 'OUT_FOR_DELIVERY'), delivery('IN_TRANSIT')),
      head(order(C, 'OUT_FOR_DELIVERY'), delivery('ARRIVED_AT_DESTINATION')),
    ];
    for (const h of states) {
      expect(JSON.stringify(h) + JSON.stringify(placeholderCopy(h.state, 'Fresh Farms'))).not.toMatch(/themselves|is delivering this/i);
    }
  });
});
