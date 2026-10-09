import { CheckoutDismissed, CheckoutFailed, CheckoutUnavailable } from '@/lib/payments/types';
import { PENDING_BODY, DECLINED_TEXT } from '@/lib/credit/pay/copy';
import { isPaymentDeclined, payErrorMessage, selectionChangedIds, walletShortBy } from '@/lib/credit/pay/errors';
import type { CreditPayAttempt, CreditPayMethod, PayItem } from '@/models/creditPay';

/**
 * Paying credit invoices, from "Pay" to "they are settled" — a sequence with no screen
 * in it, so every ending can be tested (the shape of `lib/wallet/topUpFlow.ts`).
 *
 * <p>The rule that shapes it: <b>once checkout has returned a payment id, this never
 * says the payment failed or errored.</b> Money may have moved, so a verify that errors,
 * times out or is told "still processing" polls the attempt and ends `pending`; the
 * server's webhook and poller apply it. Only the server saying PAYMENT_FAILED is
 * `declined` (the same order can be paid again).
 *
 * <p>No amount is ever sent or computed here: the items carry the outstanding the server
 * showed, and every figure afterwards is read from the attempt.
 */
export type CreditPayPhase = 'idle' | 'quoting' | 'creating' | 'checkout' | 'verifying'
  | 'paid' | 'pending' | 'refunded' | 'cancelled' | 'declined' | 'changed' | 'short' | 'error';

export interface CreditPayDeps {
  create(items: PayItem[], method: CreditPayMethod, key: string): Promise<CreditPayAttempt>;
  /** Opens Razorpay; rejects with `CheckoutDismissed` if closed. `method` pre-selects UPI or card. */
  checkout(attempt: CreditPayAttempt, method: 'upi' | 'card'): Promise<{ paymentId: string; signature?: string }>;
  verify(attemptId: number, proof: { paymentId: string; signature?: string }): Promise<CreditPayAttempt>;
  status(attemptId: number): Promise<CreditPayAttempt>;
  sleep(ms: number): Promise<void>;
  onPhase(state: { phase: CreditPayPhase; message: string | null }): void;
}

export interface CreditPayOutcome {
  phase: 'paid' | 'pending' | 'refunded' | 'cancelled' | 'declined' | 'changed' | 'short' | 'error';
  message: string | null;
  attempt?: CreditPayAttempt;
  changedInvoiceIds?: number[];
  shortBy?: string;
  /** What `create` threw, so the caller can keep or drop the idempotency key. */
  createError?: unknown;
}

/** How long to keep asking the server after a payment whose verify did not come back. */
export const POLL_DELAYS_MS = [2000, 4000, 6000] as const;

export function outcomeOfAttempt(a: CreditPayAttempt): 'paid' | 'refunded' | 'pending' | 'ended' {
  switch (a.status) {
    case 'PAID': return 'paid';
    case 'REFUNDED': return 'refunded';
    case 'CREATED': return 'pending';
    default: return 'ended';
  }
}

export async function runCreditPay(
  deps: CreditPayDeps,
  items: PayItem[],
  method: CreditPayMethod,
  key: string,
): Promise<CreditPayOutcome> {
  const set = (phase: CreditPayPhase, message: string | null = null) => deps.onPhase({ phase, message });
  const finish = (outcome: CreditPayOutcome): CreditPayOutcome => {
    set(outcome.phase, outcome.message);
    return outcome;
  };

  set('creating');
  let attempt: CreditPayAttempt;
  try {
    attempt = await deps.create(items, method, key);
  } catch (caught) {
    // Nothing was opened at Razorpay, so nothing can have been charged.
    const changed = selectionChangedIds(caught);
    if (changed != null) {
      return finish({ phase: 'changed', message: payErrorMessage(caught), changedInvoiceIds: changed, createError: caught });
    }
    const shortBy = walletShortBy(caught);
    if (shortBy != null) return finish({ phase: 'short', message: null, shortBy, createError: caught });
    return finish({ phase: 'error', message: payErrorMessage(caught), createError: caught });
  }

  // A wallet payment is applied by the create itself; so is a replayed attempt already settled.
  const created = outcomeOfAttempt(attempt);
  if (method === 'WALLET' || created !== 'pending') {
    if (created === 'paid' || created === 'refunded') return finish({ phase: created, message: null, attempt });
    return finish({ phase: 'error', message: DECLINED_TEXT, attempt });
  }

  set('checkout');
  let proof: { paymentId: string; signature?: string };
  try {
    proof = await deps.checkout(attempt, method === 'CARD' ? 'card' : 'upi');
  } catch (caught) {
    return endedWithoutPayment(deps, attempt, caught);
  }

  set('verifying');
  try {
    const verified = await deps.verify(attempt.attemptId, proof);
    const result = outcomeOfAttempt(verified);
    if (result === 'paid' || result === 'refunded') return finish({ phase: result, message: null, attempt: verified });
    attempt = verified;
  } catch (caught) {
    if (isPaymentDeclined(caught)) return finish({ phase: 'declined', message: DECLINED_TEXT, attempt });
    // Timed out, dropped, "still processing" or refused after the money moved: not known yet.
  }
  return awaitApplied(deps, attempt);
}

/** Checkout ended with no payment id. */
async function endedWithoutPayment(
  deps: CreditPayDeps,
  attempt: CreditPayAttempt,
  caught: unknown,
): Promise<CreditPayOutcome> {
  const finish = (outcome: CreditPayOutcome): CreditPayOutcome => {
    deps.onPhase({ phase: outcome.phase, message: outcome.message });
    return outcome;
  };
  if (caught instanceof CheckoutDismissed) {
    // Android UPI can report "cancelled" after the money moved: ask before saying anything.
    try {
      const now = await deps.status(attempt.attemptId);
      const result = outcomeOfAttempt(now);
      if (result === 'paid' || result === 'refunded') return finish({ phase: result, message: null, attempt: now });
    } catch {
      // Unreachable: quiet cancel; the server applies anything that did arrive.
    }
    return finish({ phase: 'cancelled', message: null, attempt });
  }
  if (caught instanceof CheckoutUnavailable) return finish({ phase: 'error', message: caught.message, attempt });
  if (caught instanceof CheckoutFailed) return finish({ phase: 'declined', message: DECLINED_TEXT, attempt });
  const detail = caught instanceof Error && caught.message ? `${caught.message} ` : '';
  return finish({
    phase: 'error',
    message: `${detail}If any money left your account, it will be returned to you.`,
    attempt,
  });
}

/** Ask the server a few times whether the payment has been applied; else it is pending. */
async function awaitApplied(deps: CreditPayDeps, attempt: CreditPayAttempt): Promise<CreditPayOutcome> {
  let latest = attempt;
  for (const delay of POLL_DELAYS_MS) {
    await deps.sleep(delay);
    try {
      latest = await deps.status(attempt.attemptId);
      const result = outcomeOfAttempt(latest);
      if (result === 'paid' || result === 'refunded') {
        deps.onPhase({ phase: result, message: null });
        return { phase: result, message: null, attempt: latest };
      }
    } catch {
      // Keep asking; an unreachable server is not an answer.
    }
  }
  deps.onPhase({ phase: 'pending', message: PENDING_BODY });
  return { phase: 'pending', message: PENDING_BODY, attempt: latest };
}
