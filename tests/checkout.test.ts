import { completeCheckout } from '@/lib/payments/checkout';
import { openRazorpayCheckout, toCheckoutError } from '@/lib/payments/razorpayCheckout';
import { CheckoutDismissed, CheckoutFailed, CheckoutUnavailable } from '@/lib/payments/types';
import { simulateCheckout } from '@/services/payments';
import type { IntentPaymentIntent } from '@/models/intent';

jest.mock('@/services/payments', () => ({
  simulateCheckout: jest.fn(async () => ({ providerPaymentId: 'mock_pay_1' })),
}));

jest.mock('@/lib/payments/razorpayCheckout', () => ({
  ...jest.requireActual('@/lib/payments/razorpayCheckout'),
  openRazorpayCheckout: jest.fn(async () => ({ providerPaymentId: 'pay_rzp_1' })),
}));

function intent(overrides: Partial<IntentPaymentIntent>): IntentPaymentIntent {
  return {
    supplierOrderId: 70,
    paymentId: 7,
    provider: 'RAZORPAY',
    providerOrderId: 'order_A',
    amount: '1500.00',
    currency: 'INR',
    publicKey: 'rzp_test_key',
    ...overrides,
  };
}

describe('completeCheckout', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses the server simulation when the server is on the mock', async () => {
    const result = await completeCheckout('token', intent({ provider: 'MOCK' }), 'Order 1');

    expect(result.providerPaymentId).toBe('mock_pay_1');
    expect(simulateCheckout).toHaveBeenCalledWith('token', 7);
    expect(openRazorpayCheckout).not.toHaveBeenCalled();
  });

  it("opens Razorpay on the server's order and key, and states no amount", async () => {
    const result = await completeCheckout('token', intent({}), 'Order 1');

    expect(result.providerPaymentId).toBe('pay_rzp_1');
    expect(simulateCheckout).not.toHaveBeenCalled();
    const request = (openRazorpayCheckout as jest.Mock).mock.calls[0][0];
    expect(request).toMatchObject({ key: 'rzp_test_key', providerOrderId: 'order_A' });
    // The amount lives on the provider order. Paise computed here would be the
    // client doing money arithmetic.
    expect(request).not.toHaveProperty('amount');
  });

  it('refuses a Razorpay intent with no key rather than opening a broken window', async () => {
    await expect(completeCheckout('token', intent({ publicKey: null }), 'Order 1'))
      .rejects.toBeInstanceOf(CheckoutUnavailable);
    expect(openRazorpayCheckout).not.toHaveBeenCalled();
  });

  it('refuses a provider this build does not know', async () => {
    await expect(completeCheckout('token', intent({ provider: 'STRIPE' }), 'Order 1'))
      .rejects.toBeInstanceOf(CheckoutUnavailable);
  });
});

describe('toCheckoutError', () => {
  it('reads code 2 as the customer closing the window', () => {
    expect(toCheckoutError({ code: 2, description: 'Payment cancelled by user' }))
      .toBeInstanceOf(CheckoutDismissed);
  });

  it("unwraps Android's JSON description into a sentence", () => {
    const error = toCheckoutError({
      code: 0,
      description: JSON.stringify({ error: { description: 'Your card was declined.' } }),
    });
    expect(error).toBeInstanceOf(CheckoutFailed);
    expect(error.message).toBe('Your card was declined.');
  });

  it("keeps iOS's plain description as it is", () => {
    expect(toCheckoutError({ code: 0, description: 'Network error' }).message).toBe('Network error');
  });
});
