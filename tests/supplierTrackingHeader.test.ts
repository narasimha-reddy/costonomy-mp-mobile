import { orderTrackingView } from '@/lib/delivery/orderTracking';
import { supplierTrackingHeader } from '@/lib/delivery/supplierTrackingHeader';
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
  outletName: 'Cafe Mocha', cancellationReason: null, ...extra,
});
const delivery = (status: DeliveryStatus, extra: object = {}, mode: any = 'COSTONOMY') => ({
  status, mode, driverName: 'Ravi Kumar', driverPhone: '9999999999', trackable: mode === 'COSTONOMY',
  location: northOf(2000), locationStale: false, locationAgeSeconds: 10, failureReason: 'Rider app timed out',
  etaMinutes: null, estimatedArrivalAt: null, ...extra,
});

function head(o: any, d: any = null, drop: any = DROP) {
  const view = orderTrackingView({ audience: 'supplier', order: o, delivery: d, nowMs: NOW });
  return supplierTrackingHeader({ view, order: o, delivery: d, drop, nowMs: NOW });
}
const C = 'COSTONOMY_DELIVERY';

describe('supplierTrackingHeader state matrix', () => {
  it('speaks about the restaurant on the supplier line', () => {
    expect(head(order(C, 'CONFIRMED')).supplierLine).toBe('Cafe Mocha');
    expect(head(order(C, 'CONFIRMED', { outletName: null })).supplierLine).toBe('The restaurant');
  });
  it('names the restaurant and the outlet on the supplier line', () => {
    expect(head(order(C, 'CONFIRMED', { restaurantName: 'Mocha Group' })).supplierLine).toBe('Mocha Group · Cafe Mocha');
    expect(head(order(C, 'CONFIRMED', { restaurantName: 'Cafe Mocha' })).supplierLine).toBe('Cafe Mocha');
    expect(head(order(C, 'CONFIRMED', { restaurantName: 'Mocha Group', outletName: null })).supplierLine)
      .toBe('Mocha Group');
  });
  it('cancelled', () => {
    expect(head(order(C, 'CANCELLED', { cancellationReason: 'Out of stock' }))).toMatchObject({
      state: 'cancelled', title: 'Order cancelled', tone: 'neutral', map: 'none', partner: 'none',
      pill: { text: 'Out of stock', tone: 'normal' },
    });
    expect(head(order(C, 'CANCELLED')).pill).toBeNull();
  });
  it('draft', () => {
    expect(head(order(C, 'DRAFT'))).toMatchObject({
      state: 'draft', title: 'Awaiting payment', tone: 'neutral', map: 'none',
      pill: { text: 'The restaurant has not completed payment yet.' },
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
  });
  it('failed shows the reason to the supplier', () => {
    expect(head(order(C, 'OUT_FOR_DELIVERY'), delivery('DELIVERY_FAILED'))).toMatchObject({
      state: 'failed', title: 'Delivery failed', tone: 'neutral', map: 'none', partner: 'none',
      pill: { text: 'Rider app timed out', tone: 'warning' },
    });
    expect(head(order(C, 'OUT_FOR_DELIVERY'), delivery('DELIVERY_FAILED', { failureReason: null })).pill).toBeNull();
  });
  it('pickup_ready', () => {
    expect(head(order('PICKUP', 'READY_FOR_PICKUP'))).toMatchObject({
      state: 'pickup_ready', title: 'Waiting for collection', map: 'none', partner: 'none',
      pill: { text: 'The restaurant will collect it from your store.' },
    });
  });
  it('own_ready and own_on_the_way', () => {
    expect(head(order('SUPPLIER_DELIVERY', 'READY_FOR_PICKUP'), delivery('DELIVERY_REQUESTED', {}, 'SUPPLIER_OWN'))).toMatchObject({
      state: 'own_ready', title: 'Ready to send', pill: { text: 'Dispatch it when it leaves your store.' },
    });
    expect(head(order('SUPPLIER_DELIVERY', 'OUT_FOR_DELIVERY'), delivery('IN_TRANSIT', {}, 'SUPPLIER_OWN'))).toMatchObject({
      state: 'own_on_the_way', title: 'Out for delivery', map: 'none', pill: { text: 'Mark it delivered once it arrives.' },
    });
  });
  it('placed', () => {
    expect(head(order(C, 'CONFIRMED'))).toMatchObject({
      state: 'placed', layout: 'placed', title: 'New order to prepare', tone: 'neutral', map: 'none',
    });
  });
  it('preparing has no map and no partner area', () => {
    expect(head(order(C, 'PREPARING'))).toMatchObject({
      state: 'preparing', title: 'Pack the order', map: 'none', partner: 'none',
      pill: { text: 'Mark it ready once it is packed' },
    });
  });
  it('searching names the restaurant and shows the search progress', () => {
    const d = delivery('PROVIDER_SELECTED', { driverName: null, trackable: false });
    expect(head(order(C, 'READY_FOR_PICKUP'), d)).toMatchObject({
      state: 'searching', title: 'Waiting for a delivery partner for Cafe Mocha', map: 'pending', partner: 'none',
      pill: { text: 'We\'re looking for a partner near your store.' },
    });
    // No drop known: nothing to draw yet.
    expect(head(order(C, 'READY_FOR_PICKUP'), d, null).map).toBe('none');
  });
  it('ready with no delivery yet reads as ready to send', () => {
    expect(head(order(C, 'READY_FOR_PICKUP'))).toMatchObject({
      state: 'searching', title: 'Ready to send', pill: { text: 'Request a delivery partner to dispatch it' },
    });
  });
  it('no_partner when the search stopped', () => {
    expect(head(order(C, 'READY_FOR_PICKUP'), delivery('QUOTE_FAILED', { driverName: null, trackable: false }))).toMatchObject({
      state: 'no_partner', title: 'No partner found yet', map: 'pending', partner: 'none',
      pill: { text: 'Rider app timed out', tone: 'warning' },
    });
  });
  it('assigned', () => {
    expect(head(order(C, 'READY_FOR_PICKUP'), delivery('DRIVER_ASSIGNED'))).toMatchObject({
      state: 'assigned', title: 'Ravi is on the way to collect', map: 'live', partner: 'card',
      pill: { text: 'Keep order ORD-77 at the counter' },
    });
  });
  it('at_pickup', () => {
    expect(head(order(C, 'READY_FOR_PICKUP'), delivery('DRIVER_AT_PICKUP'))).toMatchObject({
      state: 'at_pickup', title: 'Ravi is at your store', map: 'live', pill: { text: 'Hand over order ORD-77' },
    });
  });
  it('on_the_way names the restaurant and uses the ETA', () => {
    expect(head(order(C, 'OUT_FOR_DELIVERY'), delivery('IN_TRANSIT', { etaMinutes: 12 }))).toMatchObject({
      state: 'on_the_way', title: 'Order collected, on the way to Cafe Mocha', map: 'live', partner: 'card',
      pill: { text: 'Arriving in 12 mins · On time' },
    });
    expect(head(order(C, 'OUT_FOR_DELIVERY'), delivery('IN_TRANSIT', { location: null })).pill).toMatchObject({
      text: 'On the way', subText: 'Waiting for the partner\'s location',
    });
  });
  it('arriving and reached from the distance', () => {
    expect(head(order(C, 'OUT_FOR_DELIVERY'), delivery('IN_TRANSIT', { location: northOf(200) }))).toMatchObject({
      state: 'arriving', title: 'Arriving at Cafe Mocha now', map: 'arriving',
    });
    expect(head(order(C, 'OUT_FOR_DELIVERY'), delivery('IN_TRANSIT', { location: northOf(20) }))).toMatchObject({
      state: 'reached', title: 'Ravi has reached Cafe Mocha', map: 'reached',
    });
  });
  it('late shows the warning pill', () => {
    const d = delivery('IN_TRANSIT', { estimatedArrivalAt: '2026-01-01T09:50:00Z' });
    expect(head(order(C, 'OUT_FOR_DELIVERY'), d).pill).toMatchObject({ text: 'Running late by 10 min', tone: 'warning' });
  });
  it('never names a provider', () => {
    const banned = /pidge|porter|borzo|shadowfax|mock/i;
    const statuses: DeliveryStatus[] = ['PROVIDER_SELECTED', 'QUOTE_FAILED', 'DRIVER_ASSIGNED', 'DRIVER_AT_PICKUP',
      'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_DESTINATION', 'DELIVERED', 'DELIVERY_FAILED', 'CANCELLED'];
    statuses.forEach((s) => {
      ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'DRAFT']
        .forEach((o) => {
          const h = head(order(C, o), delivery(s, { failureReason: null }));
          expect(JSON.stringify(h)).not.toMatch(banned);
        });
    });
  });
});
