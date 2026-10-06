import { wantsDeliveryPartner } from '@/lib/delivery/deliveryPartner';

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
