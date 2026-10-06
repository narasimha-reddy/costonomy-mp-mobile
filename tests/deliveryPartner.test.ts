import { canRetryPartner, wantsDeliveryPartner } from '@/lib/delivery/deliveryPartner';

describe('wantsDeliveryPartner', () => {
  it('is true only for an order sold with Costonomy delivery', () => {
    expect(wantsDeliveryPartner('COSTONOMY_DELIVERY')).toBe(true);
  });

  it('is false when the supplier delivers themselves, free or at a charge', () => {
    expect(wantsDeliveryPartner('SUPPLIER_DELIVERY')).toBe(false);
  });

  it('is false for a pickup, and for a missing mode', () => {
    expect(wantsDeliveryPartner('PICKUP')).toBe(false);
    expect(wantsDeliveryPartner(null)).toBe(false);
    expect(wantsDeliveryPartner(undefined)).toBe(false);
  });
});

describe('canRetryPartner', () => {
  it('is true when a partner delivery stopped without a driver', () => {
    for (const status of ['QUOTE_FAILED', 'PROVIDER_UNAVAILABLE', 'DRIVER_CANCELLED', 'PICKUP_FAILED']) {
      expect(canRetryPartner('COSTONOMY', status)).toBe(true);
    }
  });

  it('is false while a driver is assigned or moving, once finished, and for the supplier\'s own delivery', () => {
    for (const status of ['DELIVERY_REQUESTED', 'DRIVER_ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED']) {
      expect(canRetryPartner('COSTONOMY', status)).toBe(false);
    }
    expect(canRetryPartner('SUPPLIER_OWN', 'QUOTE_FAILED')).toBe(false);
    expect(canRetryPartner('COSTONOMY', null)).toBe(false);
  });
});
