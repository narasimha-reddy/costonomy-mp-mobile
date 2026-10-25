import { deliveryRefetchMs, REVIEW_POLL_MS, trackingPollMs } from '@/lib/delivery/trackingPoll';

const base = { mode: 'COSTONOMY', focused: true, socket: false };

describe('trackingPollMs', () => {
  it('5 s while the rider is live', () => {
    for (const status of ['DRIVER_ASSIGNED', 'DRIVER_AT_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_DESTINATION']) {
      expect(trackingPollMs({ ...base, status })).toBe(5_000);
    }
    expect(trackingPollMs({ ...base, status: 'IN_TRANSIT', socket: true })).toBe(5_000);
  });

  it('15 s while searching, placed or for the supplier\'s own rider', () => {
    expect(trackingPollMs({ ...base, status: 'DELIVERY_REQUESTED' })).toBe(15_000);
    expect(trackingPollMs({ ...base, status: 'PROVIDER_SELECTED' })).toBe(15_000);
    expect(trackingPollMs({ ...base, status: null })).toBe(15_000);
    expect(trackingPollMs({ ...base, status: 'IN_TRANSIT', mode: 'SUPPLIER_OWN' })).toBe(15_000);
    expect(trackingPollMs({ ...base, status: 'DELIVERY_REQUESTED', socket: true })).toBe(60_000);
  });

  it('false when unfocused', () => {
    expect(trackingPollMs({ ...base, status: 'IN_TRANSIT', focused: false })).toBe(false);
    expect(trackingPollMs({ ...base, status: null, focused: false })).toBe(false);
  });

  it('no polling once the delivery is over for good', () => {
    for (const status of ['DELIVERED', 'CANCELLED']) {
      expect(trackingPollMs({ ...base, status })).toBe(false);
    }
  });

  it('a failed delivery is not over: it keeps being asked about until our team resolves it', () => {
    expect(trackingPollMs({ ...base, status: 'DELIVERY_FAILED' })).toBe(REVIEW_POLL_MS);
    expect(trackingPollMs({ ...base, status: 'DELIVERY_FAILED', focused: false })).toBe(false);
  });

  it('a delivery under review keeps being asked about, whatever its status', () => {
    expect(trackingPollMs({ ...base, status: 'PROVIDER_UNAVAILABLE', underReview: true })).toBe(REVIEW_POLL_MS);
  });
});

describe('deliveryRefetchMs (the order screens\' delivery query)', () => {
  const screen = { focused: true, socket: false };

  it('keeps asking about a failed delivery, then stops once it is delivered or cancelled', () => {
    expect(deliveryRefetchMs({ ...screen, delivery: { status: 'DELIVERY_FAILED', mode: 'COSTONOMY' } })).toBe(REVIEW_POLL_MS);
    expect(deliveryRefetchMs({ ...screen, delivery: { status: 'DELIVERED', mode: 'COSTONOMY' } })).toBe(false);
    expect(deliveryRefetchMs({ ...screen, delivery: { status: 'CANCELLED', mode: 'COSTONOMY' } })).toBe(false);
  });

  it('keeps asking about a delivery under review until the server says it is settled', () => {
    expect(deliveryRefetchMs({ ...screen, delivery: { status: 'PROVIDER_UNAVAILABLE', mode: 'COSTONOMY', underReview: true } }))
      .toBe(REVIEW_POLL_MS);
    expect(deliveryRefetchMs({ ...screen, delivery: { status: 'PROVIDER_UNAVAILABLE', mode: 'COSTONOMY', underReview: false } }))
      .not.toBe(REVIEW_POLL_MS);
  });

  it('does not ask for a delivery that never existed once the order is over', () => {
    expect(deliveryRefetchMs({ ...screen, delivery: null, orderStatus: 'CANCELLED' })).toBe(false);
    expect(deliveryRefetchMs({ ...screen, delivery: null, orderStatus: 'READY_FOR_PICKUP' })).not.toBe(false);
  });

  it('stays quiet when the screen is not in front', () => {
    expect(deliveryRefetchMs({ focused: false, socket: false, delivery: { status: 'DELIVERY_FAILED' } })).toBe(false);
  });
});
