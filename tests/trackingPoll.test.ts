import { trackingPollMs } from '@/lib/delivery/trackingPoll';

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

  it('no polling after delivered', () => {
    for (const status of ['DELIVERED', 'CANCELLED', 'DELIVERY_FAILED']) {
      expect(trackingPollMs({ ...base, status })).toBe(false);
    }
  });
});
