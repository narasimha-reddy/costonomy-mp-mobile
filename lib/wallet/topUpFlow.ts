import { ApiError } from '@/lib/api/errors';
import { CheckoutDismissed, CheckoutUnavailable, type CheckoutRequest } from '@/lib/payments/types';
import type { TopUpConfirmation, TopUpStatus, WalletTopUp } from '@/models/wallet';

/**
 * Adding money, from "Pay" to "it is in the wallet" — as a sequence with no screen
 * in it, so every ending can be tested.
 *
 * <p>The one rule that shapes it: <b>once checkout has returned a payment, this
 * never says the payment failed.</b> Money may have moved, so a confirm that errors,
 * times out or is answered "still processing" ends as `pending` ("we're confirming
 * your payment"): the server's own job credits it. A screen that said "failed"
 * there is how someone pays a second time.
 *
 * <p>And the mirror of it: a closed checkout is `cancelled`, not an error. Nothing
 * is confirmed, nobody is alarmed. It is still checked with the server first,
 * because Android UPI can report "cancelled" after the money moved.
 */
export type TopUpPhase =
  | 'idle' | 'creating' | 'checkout' | 'confirming' | 'pending' | 'success' | 'cancelled' | 'error';

export interface TopUpState {
  phase: TopUpPhase;
  message: string | null;
}

export const IDLE: TopUpState = { phase: 'idle', message: null };

export interface TopUpOutcome extends TopUpState {
  phase: 'pending' | 'success' | 'cancelled' | 'error';
  /**
   * The error `create` threw, if that is what ended it — so the caller can keep or
   * drop the idempotency key (`useIdempotencyKey().settle`). Every other ending
   * is one the key is done with.
   */
  createError?: unknown;
}

export interface TopUpDeps {
  create(amount: string, idempotencyKey: string): Promise<WalletTopUp>;
  /** Opens the provider's checkout; rejects with `CheckoutDismissed` if it is closed. */
  checkout(top: WalletTopUp): Promise<{ paymentId: string; signature?: string }>;
  confirm(top: WalletTopUp, proof: { paymentId: string; signature?: string }): Promise<TopUpConfirmation>;
  status(topUpId: string): Promise<TopUpStatus>;
  sleep(ms: number): Promise<void>;
  onPhase(state: TopUpState): void;
}

/** How long to keep asking the server after a payment whose confirm did not come back. */
export const POLL_DELAYS_MS = [2000, 4000, 6000] as const;

export const PENDING_MESSAGE =
  'We’re confirming your payment. Your balance will update shortly. Please don’t pay again.';
const CANCELLED_MESSAGE =
  'The payment window was closed. If any money was taken, your balance will update shortly.';
const REFUNDED_MESSAGE =
  'This payment was returned to the account it came from. You can try again.';

/** The provider's checkout window as the server's top-up needs it. */
export function checkoutRequest(top: WalletTopUp, merchantName: string, themeColor: string): CheckoutRequest {
  return {
    key: top.publicKey,
    providerOrderId: top.providerOrderId,
    merchantName,
    description: 'Add money to wallet',
    themeColor,
  };
}

export async function runTopUp(
  deps: TopUpDeps,
  amount: string,
  idempotencyKey: string,
): Promise<TopUpOutcome> {
  const set = (phase: TopUpPhase, message: string | null = null) => deps.onPhase({ phase, message });

  set('creating');
  let top: WalletTopUp;
  try {
    top = await deps.create(amount, idempotencyKey);
  } catch (caught) {
    // Nothing was opened at the provider, so nothing can have been charged.
    const message = caught instanceof ApiError
      ? caught.message
      : 'Could not start the payment. Check your connection and try again.';
    set('error', message);
    return { phase: 'error', message, createError: caught };
  }

  set('checkout');
  let proof: { paymentId: string; signature?: string };
  try {
    proof = await deps.checkout(top);
  } catch (caught) {
    return endedWithoutPayment(deps, top, caught);
  }

  set('confirming');
  try {
    const confirmation = await deps.confirm(top, proof);
    if (!confirmation.pending) {
      set('success');
      return { phase: 'success', message: null };
    }
  } catch {
    // Timed out, dropped, or refused after the money moved: all "we do not know
    // yet". Fall through to asking the server, and to pending if it is not sure.
  }

  return awaitCredit(deps, top);
}

/** Checkout ended with no payment: closed, unavailable, or failed inside the provider's window. */
async function endedWithoutPayment(
  deps: TopUpDeps,
  top: WalletTopUp,
  caught: unknown,
): Promise<TopUpOutcome> {
  const set = (phase: TopUpPhase, message: string | null) => deps.onPhase({ phase, message });

  // Ask before saying anything: a closed window is not proof that no money moved.
  try {
    const status = await deps.status(top.topUpId);
    if (status === 'CREDITED') {
      set('success', null);
      return { phase: 'success', message: null };
    }
  } catch {
    // Unreachable: fall through to the wording that does not assert either way.
  }

  if (caught instanceof CheckoutDismissed) {
    set('cancelled', CANCELLED_MESSAGE);
    return { phase: 'cancelled', message: CANCELLED_MESSAGE };
  }
  if (caught instanceof CheckoutUnavailable) {
    set('error', caught.message);
    return { phase: 'error', message: caught.message };
  }
  const detail = caught instanceof Error && caught.message ? `${caught.message} ` : '';
  const message = `${detail}If any money left your account, it will be added to your wallet or returned to you.`;
  set('error', message);
  return { phase: 'error', message };
}

/** Ask the server a few times whether the payment has been credited; else it is pending. */
async function awaitCredit(deps: TopUpDeps, top: WalletTopUp): Promise<TopUpOutcome> {
  for (const delay of POLL_DELAYS_MS) {
    await deps.sleep(delay);
    try {
      const status = await deps.status(top.topUpId);
      if (status === 'CREDITED') {
        deps.onPhase({ phase: 'success', message: null });
        return { phase: 'success', message: null };
      }
      if (status === 'REFUNDED') {
        deps.onPhase({ phase: 'error', message: REFUNDED_MESSAGE });
        return { phase: 'error', message: REFUNDED_MESSAGE };
      }
    } catch {
      // Keep asking; an unreachable server is not an answer.
    }
  }
  deps.onPhase({ phase: 'pending', message: PENDING_MESSAGE });
  return { phase: 'pending', message: PENDING_MESSAGE };
}

/**
 * Lets one run at a time. A second tap while one is in flight gets the first's
 * result and starts nothing — so a double-tap cannot open two orders, on top of the
 * idempotency key that makes a retry safe.
 */
export function createSingleFlight<T>() {
  let inFlight: Promise<T> | null = null;
  return {
    get busy() { return inFlight != null; },
    run(start: () => Promise<T>): Promise<T> {
      if (inFlight != null) return inFlight;
      const running = start().finally(() => { inFlight = null; });
      inFlight = running;
      return running;
    },
  };
}

/** Rejects if `promise` has not settled in `ms`; the promise itself carries on. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}
