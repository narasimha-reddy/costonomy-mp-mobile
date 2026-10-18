import type { CheckoutRequest } from '@/lib/payments/types';

/**
 * The credit-pay checkout asks Razorpay for UPI or card only. That must apply to a credit
 * payment alone: order pay and wallet top-up send no method and get Razorpay's normal window.
 */

const BASE: CheckoutRequest = {
  key: 'rzp_test_k', providerOrderId: 'order_X', merchantName: 'Mandi', description: 'Pay dues', themeColor: 'brand',
};
const HIDDEN = [{ method: 'netbanking' }, { method: 'wallet' }, { method: 'paylater' }, { method: 'emi' }];

afterEach(() => {
  jest.resetModules();
  jest.dontMock('react-native-razorpay');
});

describe('native (react-native-razorpay)', () => {
  function load() {
    const open = jest.fn(async (_options: Record<string, unknown>) => ({ razorpay_payment_id: 'pay_1', razorpay_signature: 'sig_1' }));
    jest.doMock('react-native-razorpay', () => ({ __esModule: true, default: { open } }), { virtual: true });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@/lib/payments/razorpayCheckout') as typeof import('@/lib/payments/razorpayCheckout');
    return { open, openRazorpayCheckout: mod.openRazorpayCheckout };
  }

  it.each(['upi', 'card'] as const)('method %s: prefilled, with the other methods hidden', async (method) => {
    const { open, openRazorpayCheckout } = load();
    const result = await openRazorpayCheckout({ ...BASE, method } as CheckoutRequest);
    const options = open.mock.calls[0]?.[0] as Record<string, any>;
    expect(options.prefill).toEqual(expect.objectContaining({ method }));
    expect(options.config.display.hide).toEqual(HIDDEN);
    expect(options.order_id).toBe('order_X');
    expect(options.key).toBe('rzp_test_k');
    expect(result).toEqual({ providerPaymentId: 'pay_1', providerSignature: 'sig_1' });
  });

  it('no method: no prefill method and nothing hidden (order pay and top-up unchanged)', async () => {
    const { open, openRazorpayCheckout } = load();
    await openRazorpayCheckout(BASE);
    const options = open.mock.calls[0]?.[0] as Record<string, any>;
    expect(options.prefill?.method).toBeUndefined();
    expect(options.config).toBeUndefined();
    expect(JSON.stringify(options)).not.toContain('netbanking');
  });
});

describe('web (checkout.js)', () => {
  type Opts = Record<string, any>;
  function load() {
    const constructed: Opts[] = [];
    const open = jest.fn();
    (window as unknown as { Razorpay: unknown }).Razorpay = function Razorpay(this: unknown, options: Opts) {
      constructed.push(options);
      return { open };
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@/lib/payments/razorpayCheckout.web') as typeof import('@/lib/payments/razorpayCheckout.web');
    return { constructed, open, openRazorpayCheckout: mod.openRazorpayCheckout };
  }
  afterEach(() => { delete (window as unknown as { Razorpay?: unknown }).Razorpay; });

  it.each(['upi', 'card'] as const)('method %s: prefilled, with the other methods hidden', async (method) => {
    const { constructed, open, openRazorpayCheckout } = load();
    const pending = openRazorpayCheckout({ ...BASE, method } as CheckoutRequest);
    await Promise.resolve();
    await Promise.resolve();
    expect(open).toHaveBeenCalled();
    const options = constructed[0] as Opts;
    expect(options.prefill).toEqual(expect.objectContaining({ method }));
    expect(options.config.display.hide).toEqual(HIDDEN);
    expect(options.order_id).toBe('order_X');
    options.handler({ razorpay_payment_id: 'pay_1', razorpay_signature: 'sig_1' });
    await expect(pending).resolves.toEqual({ providerPaymentId: 'pay_1', providerSignature: 'sig_1' });
  });

  it('no method: no prefill method and nothing hidden', async () => {
    const { constructed, open, openRazorpayCheckout } = load();
    const pending = openRazorpayCheckout(BASE);
    await Promise.resolve();
    await Promise.resolve();
    expect(open).toHaveBeenCalled();
    const options = constructed[0] as Opts;
    expect(options.prefill?.method).toBeUndefined();
    expect(options.config).toBeUndefined();
    expect(JSON.stringify(options)).not.toContain('netbanking');
    options.handler({ razorpay_payment_id: 'pay_2' });
    await pending;
  });
});
