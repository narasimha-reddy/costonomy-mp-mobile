import { canRetryPartner } from '@/lib/delivery/deliveryPartner';
import { deliveryPollMs } from '@/lib/delivery/partnerSearch';

describe('no retry while our team is checking a delivery (API D-206)', () => {
  it('offers a retry for a stopped search, as before', () => {
    for (const status of ['QUOTE_FAILED', 'PROVIDER_UNAVAILABLE', 'DRIVER_CANCELLED', 'PICKUP_FAILED']) {
      expect(canRetryPartner('COSTONOMY', status)).toBe(true);
      expect(canRetryPartner('COSTONOMY', status, false)).toBe(true);
    }
  });

  it('offers none when the server says it is under review, because that could book a second courier', () => {
    for (const status of ['QUOTE_FAILED', 'PROVIDER_UNAVAILABLE', 'DRIVER_CANCELLED', 'PICKUP_FAILED']) {
      expect(canRetryPartner('COSTONOMY', status, true)).toBe(false);
    }
  });

  it('never offers one for a supplier\'s own delivery or a failed hand-over', () => {
    expect(canRetryPartner('SUPPLIER_OWN', 'QUOTE_FAILED')).toBe(false);
    expect(canRetryPartner('COSTONOMY', 'DELIVERY_FAILED')).toBe(false);
  });

  it('the supplier order screen stops its quick polling for a delivery under review', () => {
    expect(deliveryPollMs({ mode: 'COSTONOMY', status: 'PROVIDER_UNAVAILABLE' }, false, false)).toBe(15000);
    expect(deliveryPollMs({ mode: 'COSTONOMY', status: 'PROVIDER_UNAVAILABLE', underReview: true }, false, false)).toBe(false);
  });
});
