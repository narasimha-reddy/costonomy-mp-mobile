import {
  FIND_POLL_MS, FIND_TIMEOUT_MS, deliveryPollMs, partnerAwaitPhase,
} from '@/lib/delivery/partnerSearch';

const base = { orderStatus: 'READY_FOR_PICKUP', deliveryMode: 'COSTONOMY_DELIVERY', hasDelivery: false, timedOut: false };

describe('waiting for the auto-dispatched partner', () => {
  it('says finding while there is no delivery yet', () => {
    expect(partnerAwaitPhase(base)).toBe('finding');
  });

  it('offers the manual button only after the timeout', () => {
    expect(partnerAwaitPhase({ ...base, timedOut: true })).toBe('manual');
  });

  it('shows neither once a delivery exists', () => {
    expect(partnerAwaitPhase({ ...base, hasDelivery: true })).toBe('none');
    expect(partnerAwaitPhase({ ...base, hasDelivery: true, timedOut: true })).toBe('none');
  });

  it('does not apply to pickup, own delivery or other statuses', () => {
    expect(partnerAwaitPhase({ ...base, deliveryMode: 'PICKUP' })).toBe('none');
    expect(partnerAwaitPhase({ ...base, deliveryMode: 'SUPPLIER_DELIVERY' })).toBe('none');
    expect(partnerAwaitPhase({ ...base, orderStatus: 'PREPARING' })).toBe('none');
  });

  it('polls every 2.5 s while empty, then backs off, and follows the normal poll once it exists', () => {
    expect(FIND_POLL_MS).toBe(2500);
    expect(FIND_TIMEOUT_MS).toBe(60000);
    expect(deliveryPollMs(null, true, false)).toBe(FIND_POLL_MS);
    expect(deliveryPollMs(null, true, true)).toBe(15000);
    expect(deliveryPollMs(null, false, false)).toBe(false);
    expect(deliveryPollMs({ mode: 'COSTONOMY', status: 'DELIVERY_REQUESTED' }, true, false)).toBe(15000);
    expect(deliveryPollMs({ mode: 'COSTONOMY', status: 'DRIVER_ASSIGNED' }, true, false)).toBe(false);
    expect(deliveryPollMs({ mode: 'SUPPLIER_OWN', status: 'DELIVERY_REQUESTED' }, false, false)).toBe(false);
  });
});
