import {
  QUANTITY_REQUIRED, buildSubscriptionPayload, deliveryModeLabel, paymentMethodLabel, tomorrowInIndia,
  type SubscriptionForm,
} from '@/lib/subscription/form';
import { SUBSCRIPTION_WALLET } from './fixtures/catchWeightContract';

const form = (over: Partial<SubscriptionForm> = {}): SubscriptionForm => ({
  supplierStoreId: 12, supplierSkuId: 77, quantity: '10', unit: 'LTR', frequency: 'DAILY', startDate: '2026-10-06',
  paymentMethod: 'WALLET', deliveryMode: 'SUPPLIER_DELIVERY', preferredSlotId: null, notes: '', ...over,
});

/** The fields `SubscriptionDtos.CreateSubscriptionRequest` reads: the API refuses a body with any other (FAIL_ON_UNKNOWN_PROPERTIES). */
const REQUEST_FIELDS = [
  'supplierStoreId', 'supplierSkuId', 'quantity', 'unit', 'frequency', 'preferredSlotId', 'deliveryMode', 'paymentMethod',
  'startDate', 'endDate', 'notes',
];

describe('the subscription body', () => {
  it('sends the payment method, and only fields the API reads', () => {
    const built = buildSubscriptionPayload(form());
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.payload.paymentMethod).toBe('WALLET');
    expect(Object.keys(built.payload).every((key) => REQUEST_FIELDS.includes(key))).toBe(true);
    expect(built.payload.deliveryMode).toBe('SUPPLIER_DELIVERY');
  });

  it('sends credit when credit was chosen', () => {
    const built = buildSubscriptionPayload(form({ paymentMethod: 'CREDIT' }));
    expect(built.ok && built.payload.paymentMethod).toBe('CREDIT');
  });

  it('refuses an empty, zero or malformed quantity instead of quietly turning it into 1', () => {
    for (const quantity of ['', '  ', '0', '0.0', 'abc', '-2', '1e3', '1,5']) {
      expect(buildSubscriptionPayload(form({ quantity }))).toEqual({ ok: false, message: QUANTITY_REQUIRED });
    }
  });

  it('sends the quantity as typed (a string), trimmed, so no float noise reaches the server', () => {
    const built = buildSubscriptionPayload(form({ quantity: ' 2.5 ' }));
    expect(built.ok && built.payload.quantity).toBe('2.5');
  });

  it('sends no slot for a pickup, and the chosen one for a delivery', () => {
    expect(buildSubscriptionPayload(form({ deliveryMode: 'PICKUP', preferredSlotId: 5 }))).toMatchObject({ ok: true, payload: { preferredSlotId: undefined } });
    expect(buildSubscriptionPayload(form({ preferredSlotId: 5 }))).toMatchObject({ ok: true, payload: { preferredSlotId: 5 } });
  });
});

describe('dates and labels', () => {
  it('"tomorrow" is India\'s tomorrow, not the phone\'s UTC one', () => {
    // 20:00 UTC on 5 October is 01:30 on 6 October in India, so tomorrow is the 7th (the UTC date would say the 6th).
    expect(tomorrowInIndia(new Date('2026-10-05T20:00:00Z'))).toBe('2026-10-07');
    // 03:00 UTC is 08:30 in India on the same day.
    expect(tomorrowInIndia(new Date('2026-10-05T03:00:00Z'))).toBe('2026-10-06');
  });

  it('names the payment method and delivery mode the API returns, and nothing for one it does not know', () => {
    expect(paymentMethodLabel(SUBSCRIPTION_WALLET.paymentMethod)).toBe('Pay from wallet');
    expect(paymentMethodLabel('CREDIT')).toBe('Pay on credit');
    expect(paymentMethodLabel('PREPAID')).toBeNull();
    expect(deliveryModeLabel(SUBSCRIPTION_WALLET.deliveryMode)).toBe('Supplier delivery');
    expect(deliveryModeLabel('COSTONOMY_DELIVERY')).toBeNull();
  });
});
