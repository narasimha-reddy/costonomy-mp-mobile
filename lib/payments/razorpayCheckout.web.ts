import {
  CheckoutDismissed,
  CheckoutUnavailable,
  type CheckoutRequest,
  type CheckoutResult,
} from './types';

/**
 * Razorpay's web checkout (checkout.js), for the web build.
 *
 * <p>The script is Razorpay's hosted one and is loaded on first use rather than
 * bundled: Razorpay requires it be served from their domain, and a screen that
 * never takes a payment should not pay for loading it.
 *
 * <p>A declined card does <em>not</em> end this. Razorpay keeps its window open
 * and lets the customer try again against the same order, so only a completed
 * payment or the customer closing the window settles the promise.
 */
const SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

interface RazorpayInstance {
  open: () => void;
}

type RazorpayConstructor = new (options: object) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

let loading: Promise<RazorpayConstructor> | null = null;

function loadRazorpay(): Promise<RazorpayConstructor> {
  if (typeof window !== 'undefined' && window.Razorpay) {
    return Promise.resolve(window.Razorpay);
  }
  if (loading) return loading;

  loading = new Promise<RazorpayConstructor>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      if (window.Razorpay) {
        resolve(window.Razorpay);
        return;
      }
      // Loaded but did not define Razorpay (a blocker, a bad response). Forget
      // this attempt, or every later tap would get the same cached failure until
      // the page was reloaded.
      loading = null;
      script.remove();
      reject(new CheckoutUnavailable('The payment window could not be loaded.'));
    };
    script.onerror = () => {
      // Let the next attempt try again rather than caching the failure.
      loading = null;
      script.remove();
      reject(new CheckoutUnavailable(
        'The payment window could not be loaded. Check your connection and try again.',
      ));
    };
    document.body.appendChild(script);
  });
  return loading;
}

export async function openRazorpayCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
  const Razorpay = await loadRazorpay();

  return new Promise<CheckoutResult>((resolve, reject) => {
    const checkout = new Razorpay({
      key: request.key,
      order_id: request.providerOrderId,
      name: request.merchantName,
      description: request.description,
      theme: { color: request.themeColor },
      handler: (response: { razorpay_payment_id: string; razorpay_signature?: string }) => {
        resolve({
          providerPaymentId: response.razorpay_payment_id,
          providerSignature: response.razorpay_signature,
        });
      },
      modal: {
        ondismiss: () => reject(new CheckoutDismissed()),
        // Closing mid-payment is how someone ends up unsure whether they paid.
        confirm_close: true,
      },
    });
    checkout.open();
  });
}
