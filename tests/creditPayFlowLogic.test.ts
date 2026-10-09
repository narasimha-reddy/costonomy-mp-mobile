import { ApiError } from '@/lib/api/errors';
import { isDefinitiveFailure } from '@/lib/api/idempotency';
import { CheckoutDismissed, CheckoutFailed, CheckoutUnavailable } from '@/lib/payments/types';
import { outcomeOfAttempt, POLL_DELAYS_MS, runCreditPay, type CreditPayDeps } from '@/lib/credit/pay/payFlow';
import { PENDING_BODY } from '@/lib/credit/pay/copy';
import type { CreditPayAttempt, PayItem } from '@/models/creditPay';

const ITEMS: PayItem[] = [{ invoiceId: 101, outstanding: '6500.00' }];

function attempt(over: Partial<CreditPayAttempt> = {}): CreditPayAttempt {
  return {
    attemptId: 42, outletId: 7, status: 'CREATED', method: 'UPI', paidWith: null, paymentDetail: null, invoiceCount: 1,
    amount: '6500.00', feeAmount: '0', totalCharged: '6500.00', currency: 'INR', razorpayOrderId: 'order_X',
    razorpayPaymentId: null, keyId: 'rzp_test_k', reopened: false, refundAmount: '0', refundState: 'NONE',
    createdAt: '2026-10-09T10:00:00Z', paidAt: null, expiresAt: null, walletBalanceAfter: null, suppliers: [], invoices: [],
    ...over,
  };
}
const PAID = attempt({ status: 'PAID' });
const err = (status: number, code: string, details?: Record<string, unknown>) =>
  new ApiError({ code, message: `msg ${code}`, status, details });

function harness(over: Partial<CreditPayDeps> = {}) {
  const phases: string[] = [];
  const deps: CreditPayDeps = {
    create: jest.fn(async () => attempt()),
    checkout: jest.fn(async () => ({ paymentId: 'pay_1', signature: 'sig_1' })),
    verify: jest.fn(async () => PAID),
    status: jest.fn(async () => attempt()),
    sleep: jest.fn(async () => undefined),
    onPhase: (s) => phases.push(s.phase),
    ...over,
  };
  return { deps, phases };
}

describe('outcomeOfAttempt', () => {
  it('maps the five statuses', () => {
    expect(outcomeOfAttempt(attempt({ status: 'PAID' }))).toBe('paid');
    expect(outcomeOfAttempt(attempt({ status: 'REFUNDED' }))).toBe('refunded');
    expect(outcomeOfAttempt(attempt({ status: 'CREATED' }))).toBe('pending');
    expect(outcomeOfAttempt(attempt({ status: 'FAILED' }))).toBe('ended');
    expect(outcomeOfAttempt(attempt({ status: 'EXPIRED' }))).toBe('ended');
  });
});

describe('runCreditPay', () => {
  it('wallet: create returns PAID and no checkout opens', async () => {
    const h = harness({ create: jest.fn(async () => attempt({ status: 'PAID', method: 'WALLET' })) });
    const out = await runCreditPay(h.deps, ITEMS, 'WALLET', 'k1');
    expect(out.phase).toBe('paid');
    expect(h.deps.checkout).not.toHaveBeenCalled();
    expect(h.deps.create).toHaveBeenCalledWith(ITEMS, 'WALLET', 'k1');
  });

  it('online happy path: create, checkout (lower-case method), verify with proof', async () => {
    const h = harness();
    const out = await runCreditPay(h.deps, ITEMS, 'CARD', 'k1');
    expect(out).toMatchObject({ phase: 'paid', attempt: PAID });
    expect(h.deps.checkout).toHaveBeenCalledWith(expect.objectContaining({ attemptId: 42 }), 'card');
    expect(h.deps.verify).toHaveBeenCalledWith(42, { paymentId: 'pay_1', signature: 'sig_1' });
    expect(h.phases).toEqual(['creating', 'checkout', 'verifying', 'paid']);
  });

  it('verify refunded (all invoices changed) is refunded', async () => {
    const h = harness({ verify: jest.fn(async () => attempt({ status: 'REFUNDED' })) });
    expect((await runCreditPay(h.deps, ITEMS, 'UPI', 'k')).phase).toBe('refunded');
  });

  it('verify errors, then polling finds it paid', async () => {
    const status = jest.fn()
      .mockResolvedValueOnce(attempt())
      .mockResolvedValueOnce(PAID);
    const h = harness({ verify: jest.fn(async () => { throw new Error('timed out'); }), status });
    const out = await runCreditPay(h.deps, ITEMS, 'UPI', 'k');
    expect(out.phase).toBe('paid');
    expect(h.deps.sleep).toHaveBeenNthCalledWith(1, POLL_DELAYS_MS[0]);
    expect(h.deps.sleep).toHaveBeenNthCalledWith(2, POLL_DELAYS_MS[1]);
  });

  it('CREDIT_PAY_PROCESSING three times is pending, never an error', async () => {
    const h = harness({ verify: jest.fn(async () => { throw err(409, 'CREDIT_PAY_PROCESSING'); }) });
    const out = await runCreditPay(h.deps, ITEMS, 'UPI', 'k');
    expect(out.phase).toBe('pending');
    expect(out.message).toBe(PENDING_BODY);
    expect(out.attempt?.attemptId).toBe(42);
    expect(h.deps.status).toHaveBeenCalledTimes(3);
    expect(h.deps.sleep).toHaveBeenCalledTimes(3);
  });

  it('verify returning CREATED polls too', async () => {
    const h = harness({ verify: jest.fn(async () => attempt()) });
    expect((await runCreditPay(h.deps, ITEMS, 'UPI', 'k')).phase).toBe('pending');
  });

  it('a status poll that throws keeps asking, then pending', async () => {
    const h = harness({
      verify: jest.fn(async () => { throw new Error('x'); }),
      status: jest.fn(async () => { throw new Error('offline'); }),
    });
    expect((await runCreditPay(h.deps, ITEMS, 'UPI', 'k')).phase).toBe('pending');
  });

  it('verify PAYMENT_FAILED is declined', async () => {
    const h = harness({ verify: jest.fn(async () => { throw err(422, 'PAYMENT_FAILED'); }) });
    const out = await runCreditPay(h.deps, ITEMS, 'UPI', 'k');
    expect(out.phase).toBe('declined');
    expect(h.deps.sleep).not.toHaveBeenCalled();
  });

  it('never declined or error once a payment id came back, whatever verify says', async () => {
    for (const thrown of [new Error('x'), err(400, 'VALIDATION_ERROR'), err(500, 'INTERNAL'), err(409, 'CREDIT_PAY_PROCESSING')]) {
      const h = harness({ verify: jest.fn(async () => { throw thrown; }) });
      const out = await runCreditPay(h.deps, ITEMS, 'UPI', 'k');
      expect(['declined', 'error']).not.toContain(out.phase);
    }
  });

  it('dismissed, then status PAID is paid', async () => {
    const h = harness({
      checkout: jest.fn(async () => { throw new CheckoutDismissed(); }),
      status: jest.fn(async () => PAID),
    });
    expect((await runCreditPay(h.deps, ITEMS, 'UPI', 'k')).phase).toBe('paid');
    expect(h.deps.verify).not.toHaveBeenCalled();
  });

  it('dismissed, still CREATED is cancelled (quiet)', async () => {
    const h = harness({ checkout: jest.fn(async () => { throw new CheckoutDismissed(); }) });
    const out = await runCreditPay(h.deps, ITEMS, 'UPI', 'k');
    expect(out.phase).toBe('cancelled');
    expect(h.deps.status).toHaveBeenCalledTimes(1);
  });

  it('dismissed and the status check fails is still cancelled', async () => {
    const h = harness({
      checkout: jest.fn(async () => { throw new CheckoutDismissed(); }),
      status: jest.fn(async () => { throw new Error('offline'); }),
    });
    expect((await runCreditPay(h.deps, ITEMS, 'UPI', 'k')).phase).toBe('cancelled');
  });

  it('CheckoutFailed before a payment id is declined', async () => {
    const h = harness({ checkout: jest.fn(async () => { throw new CheckoutFailed('bad'); }) });
    expect((await runCreditPay(h.deps, ITEMS, 'UPI', 'k')).phase).toBe('declined');
  });

  it('CheckoutUnavailable is an error with its message', async () => {
    const h = harness({ checkout: jest.fn(async () => { throw new CheckoutUnavailable('Needs the full app'); }) });
    const out = await runCreditPay(h.deps, ITEMS, 'UPI', 'k');
    expect(out).toMatchObject({ phase: 'error', message: 'Needs the full app' });
  });

  it('create 409 changed carries the ids', async () => {
    const h = harness({ create: jest.fn(async () => { throw err(409, 'CREDIT_PAY_SELECTION_CHANGED', { changedInvoiceIds: [205] }); }) });
    const out = await runCreditPay(h.deps, ITEMS, 'UPI', 'k');
    expect(out).toMatchObject({ phase: 'changed', changedInvoiceIds: [205] });
    expect(out.createError).toBeInstanceOf(ApiError);
  });

  it('create 422 short carries shortBy', async () => {
    const h = harness({ create: jest.fn(async () => { throw err(422, 'WALLET_INSUFFICIENT_BALANCE', { shortBy: 3480, balance: 9000 }); }) });
    const out = await runCreditPay(h.deps, ITEMS, 'WALLET', 'k');
    expect(out).toMatchObject({ phase: 'short', shortBy: '3480' });
  });

  it('create 403 FORBIDDEN is the flag-off line', async () => {
    const h = harness({ create: jest.fn(async () => { throw err(403, 'FORBIDDEN'); }) });
    expect(await runCreditPay(h.deps, ITEMS, 'UPI', 'k')).toMatchObject({ phase: 'error', message: "Paying online isn't available yet." });
  });

  it('other create errors are error with the mapped message, nothing opened', async () => {
    const h = harness({ create: jest.fn(async () => { throw err(422, 'PAYMENT_FAILED'); }) });
    const out = await runCreditPay(h.deps, ITEMS, 'UPI', 'k');
    expect(out).toMatchObject({ phase: 'error', message: 'msg PAYMENT_FAILED' });
    expect(h.deps.checkout).not.toHaveBeenCalled();
  });

  it('a network create error keeps the key (not definitive), a refusal drops it', async () => {
    const net = harness({ create: jest.fn(async () => { throw new Error('network'); }) });
    const a = await runCreditPay(net.deps, ITEMS, 'UPI', 'k');
    expect(a.phase).toBe('error');
    expect(isDefinitiveFailure(a.createError)).toBe(false);
    const refused = harness({ create: jest.fn(async () => { throw err(422, 'PAYMENT_FAILED'); }) });
    const b = await runCreditPay(refused.deps, ITEMS, 'UPI', 'k');
    expect(isDefinitiveFailure(b.createError)).toBe(true);
  });

  it('a create that comes back already PAID skips checkout', async () => {
    const h = harness({ create: jest.fn(async () => PAID) });
    expect((await runCreditPay(h.deps, ITEMS, 'UPI', 'k')).phase).toBe('paid');
    expect(h.deps.checkout).not.toHaveBeenCalled();
  });
});
