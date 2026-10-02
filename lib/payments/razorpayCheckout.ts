import {
  CheckoutDismissed,
  CheckoutFailed,
  CheckoutUnavailable,
  type CheckoutRequest,
  type CheckoutResult,
} from './types';

/**
 * Razorpay's native checkout, on iOS and Android. The web build uses
 * `razorpayCheckout.web.ts` instead.
 *
 * <p><b>Needs a development build.</b> `react-native-razorpay` wraps Razorpay's
 * native SDKs, which Expo Go does not contain — so it is required lazily, here,
 * rather than imported at the top: importing it in Expo Go fails at load time
 * and would take the whole pay screen down with it, where this way the screen
 * can say what is wrong.
 */
export async function openRazorpayCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
  let RazorpayCheckout: { open: (options: object) => Promise<{ razorpay_payment_id: string }> };
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    RazorpayCheckout = require('react-native-razorpay').default;
  } catch {
    throw new CheckoutUnavailable(
      'Payments need the full app. This preview build cannot open the payment window.',
    );
  }

  try {
    const result = await RazorpayCheckout.open({
      key: request.key,
      order_id: request.providerOrderId,
      name: request.merchantName,
      description: request.description,
      theme: { color: request.themeColor },
    });
    return { providerPaymentId: result.razorpay_payment_id };
  } catch (caught) {
    // On Android Expo Go the require succeeds but the native module is absent,
    // so open() fails with a TypeError rather than a checkout error. That is
    // "this build cannot take payments", not "your payment failed".
    if (caught instanceof TypeError) {
      throw new CheckoutUnavailable(
        'Payments need the full app. This preview build cannot open the payment window.',
      );
    }
    throw toCheckoutError(caught);
  }
}

/** Razorpay's SDKs report cancellation as code 2 on both platforms. */
const PAYMENT_CANCELLED = 2;

/**
 * Read a native checkout error.
 *
 * <p>Exported for tests. Android sends `description` as a JSON string wrapping the
 * real message, iOS as the message itself; both are handled so the person sees a
 * sentence rather than a blob.
 */
export function toCheckoutError(caught: unknown): Error {
  const error = (caught ?? {}) as { code?: number; description?: string };
  if (error.code === PAYMENT_CANCELLED) {
    return new CheckoutDismissed();
  }

  let message = error.description ?? '';
  try {
    const parsed = JSON.parse(message) as { error?: { description?: string } };
    message = parsed.error?.description ?? message;
  } catch {
    // Not JSON — already a sentence.
  }
  return new CheckoutFailed(message || 'The payment could not be completed.');
}
