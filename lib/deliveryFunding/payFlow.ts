import { ApiError } from '@/lib/api/errors';
import { CheckoutDismissed, CheckoutUnavailable, type CheckoutRequest } from '@/lib/payments/types';
import type { DeliveryFundingCheckout, DeliveryFundingConfirmation } from '@/models/deliveryFunding';

/**
 * Paying a delivery charge directly, from "Pay" to "recorded", as a sequence with no screen in it.
 *
 * <p>The rule is the wallet top-up's: <b>once checkout has returned a payment this never says it failed.</b> A
 * confirm that errors, times out or is not yet recorded ends as `pending`; the server's webhook and sweep record
 * a payment it can verify, and refund one it cannot use. Saying "failed" there is how a supplier pays twice.
 * A closed checkout is `cancelled`, not an error, but it is still checked with the server first.
 */
export type FundingPayPhase = 'idle' | 'opening' | 'checkout' | 'confirming' | 'pending' | 'paid' | 'cancelled' | 'error';

export interface FundingPayOutcome {
  phase: 'pending' | 'paid' | 'cancelled' | 'error';
  message: string | null;
  /** The error `initiate` threw, so the caller can keep or drop the idempotency key. */
  initiateError?: unknown;
}

export interface FundingPayDeps {
  initiate(): Promise<DeliveryFundingCheckout>;
  /** Opens the gateway's window; rejects with `CheckoutDismissed` if it is closed. */
  checkout(checkout: DeliveryFundingCheckout): Promise<{ paymentId: string; signature: string }>;
  confirm(proof: { paymentId: string; signature: string }): Promise<DeliveryFundingConfirmation>;
  /** Whether the server now has this charge as paid directly. */
  isPaid(): Promise<boolean>;
  sleep(ms: number): Promise<void>;
  onPhase(phase: FundingPayPhase): void;
}

export const POLL_DELAYS_MS = [2000, 4000, 6000] as const;

export const PENDING_MESSAGE =
  'We’re confirming your payment. This charge will update shortly. Please don’t pay again.';
const CANCELLED_MESSAGE =
  'The payment window was closed. If any money was taken, this charge will update shortly.';

/** The gateway's window for this charge. The amount is the order's, never typed here. */
export function fundingCheckoutRequest(
  checkout: DeliveryFundingCheckout,
  merchantName: string,
  themeColor: string,
): CheckoutRequest {
  return {
    key: checkout.keyId,
    providerOrderId: checkout.razorpayOrderId,
    merchantName,
    description: 'Delivery charge',
    themeColor,
  };
}

export async function runFundingPayment(deps: FundingPayDeps): Promise<FundingPayOutcome> {
  deps.onPhase('opening');
  let checkout: DeliveryFundingCheckout;
  try {
    checkout = await deps.initiate();
  } catch (caught) {
    // Nothing was opened at the gateway, so nothing can have been charged.
    const message = caught instanceof ApiError
      ? caught.message
      : 'Could not start the payment. Check your connection and try again.';
    deps.onPhase('error');
    return { phase: 'error', message, initiateError: caught };
  }

  deps.onPhase('checkout');
  let proof: { paymentId: string; signature: string };
  try {
    proof = await deps.checkout(checkout);
  } catch (caught) {
    return endedWithoutPayment(deps, caught);
  }

  deps.onPhase('confirming');
  try {
    await deps.confirm(proof);
    deps.onPhase('paid');
    return { phase: 'paid', message: null };
  } catch (caught) {
    // The settlement can have taken the charge first: the server refunds this payment and says so. That is an answer,
    // and the only one that is definitely not "pending".
    if (caught instanceof ApiError && caught.status === 409) {
      deps.onPhase('error');
      return { phase: 'error', message: `${caught.message} Any payment made will be returned to you.` };
    }
    // Timed out, dropped, or still processing: all "not known yet".
  }
  return awaitRecorded(deps);
}

async function endedWithoutPayment(deps: FundingPayDeps, caught: unknown): Promise<FundingPayOutcome> {
  // Ask first: a closed window is not proof that no money moved.
  try {
    if (await deps.isPaid()) {
      deps.onPhase('paid');
      return { phase: 'paid', message: null };
    }
  } catch {
    // Unreachable: fall through to wording that does not assert either way.
  }
  if (caught instanceof CheckoutDismissed) {
    deps.onPhase('cancelled');
    return { phase: 'cancelled', message: CANCELLED_MESSAGE };
  }
  if (caught instanceof CheckoutUnavailable) {
    deps.onPhase('error');
    return { phase: 'error', message: caught.message };
  }
  const detail = caught instanceof Error && caught.message ? `${caught.message} ` : '';
  deps.onPhase('error');
  return { phase: 'error', message: `${detail}If any money left your account, it will be returned to you.` };
}

async function awaitRecorded(deps: FundingPayDeps): Promise<FundingPayOutcome> {
  for (const delay of POLL_DELAYS_MS) {
    await deps.sleep(delay);
    try {
      if (await deps.isPaid()) {
        deps.onPhase('paid');
        return { phase: 'paid', message: null };
      }
    } catch {
      // Keep asking; an unreachable server is not an answer.
    }
  }
  deps.onPhase('pending');
  return { phase: 'pending', message: PENDING_MESSAGE };
}
