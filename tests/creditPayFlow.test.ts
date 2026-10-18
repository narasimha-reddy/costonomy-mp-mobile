import { ApiError, NetworkError } from '@/lib/api/errors';
import { isDefinitiveFailure } from '@/lib/api/idempotency';
import { CheckoutDismissed, CheckoutFailed, CheckoutUnavailable } from '@/lib/payments/types';
import {
  outcomeOfAttempt, POLL_DELAYS_MS, runCreditPay, type CreditPayDeps, type CreditPayPhase,
} from '@/lib/credit/pay/payFlow';
import { createSingleFlight } from '@/lib/wallet/topUpFlow';
import type { CreditPayAttempt, CreditPayMethod, PayItem } from '@/models/creditPay';

const ITEMS: PayItem[] = [{ invoiceId: 11, outstanding: '1500.0000' }, { invoiceId: 21, outstanding: '600.5000' }];

const attempt = (o: Partial<CreditPayAttempt> = {}): CreditPayAttempt => ({
  attemptId: 9, outletId: 7, status: 'CREATED', method: 'UPI', paidWith: null, paymentDetail: null, invoiceCount: 2,
  amount: '2100.5000', feeAmount: '0.0000', totalCharged: '2100.5000', currency: 'INR',
  razorpayOrderId: 'order_X', razorpayPaymentId: null, keyId: 'rzp_test_k', reopened: false,
  refundAmount: '0.0000', refundState: 'NONE', createdAt: '2026-10-09T05:00:00Z', paidAt: null, expiresAt: null,
  walletBalanceAfter: null, suppliers: [], invoices: [], ...o,
});
const PAID = attempt({ status: 'PAID', razorpayPaymentId: 'pay_1' });
const CREATED = attempt();

const apiError = (status: number, code: string, details?: Record<string, unknown>, message = 'server says') =>
  new ApiError({ code, message, status, details });

function harness(over: Partial<CreditPayDeps> = {}) {
  const phases: { phase: CreditPayPhase; message: string | null }[] = [];
  const deps: CreditPayDeps = {
    create: jest.fn(async () => CREATED),
    checkout: jest.fn(async () => ({ paymentId: 'pay_1', signature: 'sig_1' })),
    verify: jest.fn(async () => PAID),
    status: jest.fn(async () => CREATED),
    sleep: jest.fn(async () => undefined),
    onPhase: (s) => phases.push(s),
    ...over,
  };
  return { deps, phases, names: () => phases.map((p) => p.phase) };
}

describe('outcomeOfAttempt', () => {
  it.each([
    ['PAID', 'paid'], ['REFUNDED', 'refunded'], ['CREATED', 'pending'], ['FAILED', 'ended'], ['EXPIRED', 'ended'],
  ] as const)('%s is %s', (status, expected) => {
    expect(outcomeOfAttempt(attempt({ status }))).toBe(expected);
  });
});

describe('wallet', () => {
  it('a PAID create is the end: paid, no checkout, no verify', async () => {
    const wallet = attempt({ status: 'PAID', method: 'WALLET', walletBalanceAfter: '900.0000' });
    const h = harness({ create: jest.fn(async () => wallet) });
    const out = await runCreditPay(h.deps, ITEMS, 'WALLET', 'key-w');

    expect(out.phase).toBe('paid');
    expect(out.attempt).toBe(wallet);
    expect(h.deps.create).toHaveBeenCalledWith(ITEMS, 'WALLET', 'key-w');
    expect(h.deps.checkout).not.toHaveBeenCalled();
    expect(h.deps.verify).not.toHaveBeenCalled();
    expect(h.names()[0]).toBe('creating');
    expect(h.names().at(-1)).toBe('paid');
  });
});

describe('online, happy path', () => {
  it('creates, opens checkout, verifies, and is paid', async () => {
    const h = harness();
    const out = await runCreditPay(h.deps, ITEMS, 'UPI', 'key-1');

    expect(out.phase).toBe('paid');
    expect(out.attempt).toBe(PAID);
    expect(h.deps.create).toHaveBeenCalledTimes(1);
    expect(h.deps.create).toHaveBeenCalledWith(ITEMS, 'UPI', 'key-1');
    expect(h.deps.checkout).toHaveBeenCalledWith(CREATED, 'upi');
    expect(h.deps.verify).toHaveBeenCalledWith(9, { paymentId: 'pay_1', signature: 'sig_1' });
    expect(h.names()).toEqual(expect.arrayContaining(['creating', 'checkout', 'verifying', 'paid']));
    expect(h.names().indexOf('checkout')).toBeLessThan(h.names().indexOf('verifying'));
    expect(h.names().at(-1)).toBe('paid');
  });

  it('opens checkout on the card tab for CARD', async () => {
    const h = harness({ create: jest.fn(async () => attempt({ method: 'CARD' })) });
    await runCreditPay(h.deps, ITEMS, 'CARD', 'k');
    expect(h.deps.checkout).toHaveBeenCalledWith(expect.anything(), 'card');
  });

  it('a verify that answers REFUNDED (invoices changed under the payment) ends refunded, not paid', async () => {
    const refunded = attempt({ status: 'REFUNDED', refundAmount: '2100.5000', refundState: 'PENDING' });
    const h = harness({ verify: jest.fn(async () => refunded) });
    const out = await runCreditPay(h.deps, ITEMS, 'UPI', 'k');
    expect(out.phase).toBe('refunded');
    expect(out.attempt).toBe(refunded);
  });

  it('a verify that answers PAID with some invoices skipped is still paid (the screen shows the refund)', async () => {
    const partial = attempt({ status: 'PAID', refundAmount: '600.5000', refundState: 'PENDING' });
    const h = harness({ verify: jest.fn(async () => partial) });
    const out = await runCreditPay(h.deps, ITEMS, 'UPI', 'k');
    expect(out.phase).toBe('paid');
    expect(out.attempt).toBe(partial);
  });
});

describe('after checkout returned a payment', () => {
  it('verify answers "still created": polls the status and ends paid when it lands', async () => {
    const status = jest.fn()
      .mockResolvedValueOnce(CREATED)
      .mockResolvedValueOnce(PAID);
    const h = harness({ verify: jest.fn(async () => CREATED), status });
    const out = await runCreditPay(h.deps, ITEMS, 'UPI', 'k');

    expect(out.phase).toBe('paid');
    expect(status).toHaveBeenCalledTimes(2);
    expect(status).toHaveBeenCalledWith(9);
    expect(h.deps.sleep).toHaveBeenNthCalledWith(1, 2000);
    expect(h.deps.sleep).toHaveBeenNthCalledWith(2, 4000);
  });

  it('CREDIT_PAY_PROCESSING three times in the poll is pending, never an error', async () => {
    const h = harness({
      verify: jest.fn(async () => { throw apiError(409, 'CREDIT_PAY_PROCESSING'); }),
      status: jest.fn(async () => CREATED),
    });
    const out = await runCreditPay(h.deps, ITEMS, 'UPI', 'k');

    expect(out.phase).toBe('pending');
    expect(out.attempt?.attemptId).toBe(9);
    expect(h.deps.status).toHaveBeenCalledTimes(3);
    expect((h.deps.sleep as jest.Mock).mock.calls.map((c) => c[0])).toEqual([...POLL_DELAYS_MS]);
    expect(POLL_DELAYS_MS).toEqual([2000, 4000, 6000]);
    expect(h.names().at(-1)).toBe('pending');
    expect(h.names()).not.toContain('declined');
    expect(h.names()).not.toContain('error');
  });

  // The 20 s limit is the caller's `withTimeout` around verify (as add money does); the flow sees it as a rejection.
  it('a verify that timed out falls to polling and ends paid if the server has it', async () => {
    const h = harness({
      verify: jest.fn(async () => { throw new Error('timed out'); }),
      status: jest.fn(async () => PAID),
    });
    const out = await runCreditPay(h.deps, ITEMS, 'UPI', 'k');
    expect(out.phase).toBe('paid');
    expect(h.deps.status).toHaveBeenCalledWith(9);
  });

  it('a verify that timed out and a server that never says is pending', async () => {
    const h = harness({
      verify: jest.fn(async () => { throw new Error('timed out'); }),
      status: jest.fn(async () => CREATED),
    });
    expect((await runCreditPay(h.deps, ITEMS, 'UPI', 'k')).phase).toBe('pending');
  });

  it.each([
    ['an unexpected error', () => new Error('boom')],
    ['a dropped connection', () => new NetworkError('offline')],
    ['a 500', () => apiError(500, 'INTERNAL')],
    ['a 400 it did not expect', () => apiError(400, 'SOMETHING_ELSE')],
    ['a 422 it did not expect', () => apiError(422, 'SOMETHING_ELSE')],
    ['a 404', () => apiError(404, 'NOT_FOUND')],
  ])('%s while verifying is never declined or error: money may have moved', async (_name, make) => {
    const h = harness({
      verify: jest.fn(async () => { throw make(); }),
      status: jest.fn(async () => CREATED),
    });
    const out = await runCreditPay(h.deps, ITEMS, 'UPI', 'k');
    expect(out.phase).toBe('pending');
    expect(h.names()).not.toContain('declined');
    expect(h.names()).not.toContain('error');
  });

  it('a status poll that itself fails does not turn a payment into an error', async () => {
    const h = harness({
      verify: jest.fn(async () => { throw new NetworkError('offline'); }),
      status: jest.fn(async () => { throw new NetworkError('offline'); }),
    });
    const out = await runCreditPay(h.deps, ITEMS, 'UPI', 'k');
    expect(out.phase).toBe('pending');
    expect(h.deps.status).toHaveBeenCalledTimes(3);
  });

  it('the poll finding it REFUNDED ends refunded', async () => {
    const refunded = attempt({ status: 'REFUNDED', refundAmount: '2100.5000', refundState: 'PENDING' });
    const h = harness({
      verify: jest.fn(async () => { throw new NetworkError('offline'); }),
      status: jest.fn(async () => refunded),
    });
    expect((await runCreditPay(h.deps, ITEMS, 'UPI', 'k')).phase).toBe('refunded');
  });

  it('pending carries the attempt, so the result screen can open it', async () => {
    const h = harness({ verify: jest.fn(async () => CREATED) });
    const out = await runCreditPay(h.deps, ITEMS, 'UPI', 'k');
    expect(out.phase).toBe('pending');
    expect(out.attempt?.attemptId).toBe(9);
  });

  it('the server saying the payment failed is declined, with nothing charged', async () => {
    const h = harness({ verify: jest.fn(async () => { throw apiError(422, 'PAYMENT_FAILED'); }) });
    const out = await runCreditPay(h.deps, ITEMS, 'UPI', 'k');
    expect(out.phase).toBe('declined');
    expect(out.message).toMatch(/didn.t go through\. Nothing was charged\./);
    expect(h.deps.status).not.toHaveBeenCalled();
  });
});

describe('checkout closed or failed', () => {
  it('closed with nothing paid: cancelled, quietly, after asking the server exactly once', async () => {
    const h = harness({ checkout: jest.fn(async () => { throw new CheckoutDismissed(); }) });
    const out = await runCreditPay(h.deps, ITEMS, 'UPI', 'k');

    expect(out.phase).toBe('cancelled');
    expect(h.deps.status).toHaveBeenCalledTimes(1);
    expect(h.deps.status).toHaveBeenCalledWith(9);
    expect(h.deps.verify).not.toHaveBeenCalled();
    expect(h.names()).not.toContain('error');
    expect(h.names()).not.toContain('declined');
    expect(out.message ?? '').not.toMatch(/fail|error|wrong/i);
  });

  it('closed, but the server says PAID (Android UPI reports cancel after paying): paid', async () => {
    const h = harness({
      checkout: jest.fn(async () => { throw new CheckoutDismissed(); }),
      status: jest.fn(async () => PAID),
    });
    const out = await runCreditPay(h.deps, ITEMS, 'UPI', 'k');
    expect(out.phase).toBe('paid');
    expect(out.attempt).toBe(PAID);
  });

  it('closed and the status check fails: still just cancelled', async () => {
    const h = harness({
      checkout: jest.fn(async () => { throw new CheckoutDismissed(); }),
      status: jest.fn(async () => { throw new NetworkError('offline'); }),
    });
    expect((await runCreditPay(h.deps, ITEMS, 'UPI', 'k')).phase).toBe('cancelled');
  });

  it('CheckoutFailed before any payment id is declined, and verify is never called', async () => {
    const h = harness({ checkout: jest.fn(async () => { throw new CheckoutFailed('Card declined.'); }) });
    const out = await runCreditPay(h.deps, ITEMS, 'CARD', 'k');
    expect(out.phase).toBe('declined');
    expect(h.deps.verify).not.toHaveBeenCalled();
  });

  it('CheckoutUnavailable is an error carrying its own message', async () => {
    const h = harness({
      checkout: jest.fn(async () => { throw new CheckoutUnavailable('Payments need the full app.'); }),
    });
    const out = await runCreditPay(h.deps, ITEMS, 'UPI', 'k');
    expect(out.phase).toBe('error');
    expect(out.message).toBe('Payments need the full app.');
    expect(h.deps.verify).not.toHaveBeenCalled();
  });
});

describe('create refused', () => {
  it('selection changed (409): changed, with the server\'s ids, and no checkout', async () => {
    const err = apiError(409, 'CREDIT_PAY_SELECTION_CHANGED', { changedInvoiceIds: [11, 21] });
    const h = harness({ create: jest.fn(async () => { throw err; }) });
    const out = await runCreditPay(h.deps, ITEMS, 'UPI', 'k');

    expect(out.phase).toBe('changed');
    expect(out.changedInvoiceIds).toEqual([11, 21]);
    expect(out.createError).toBe(err);
    expect(h.deps.checkout).not.toHaveBeenCalled();
  });

  it('wallet short (422): short, with shortBy exactly as the server sent it', async () => {
    const err = apiError(422, 'WALLET_INSUFFICIENT_BALANCE', { shortBy: '120.5000' });
    const h = harness({ create: jest.fn(async () => { throw err; }) });
    const out = await runCreditPay(h.deps, ITEMS, 'WALLET', 'k');

    expect(out.phase).toBe('short');
    expect(out.shortBy).toBe('120.5000');
    expect(out.createError).toBe(err);
    expect(h.deps.checkout).not.toHaveBeenCalled();
  });

  it('any other API refusal: error with the server\'s own sentence', async () => {
    const err = apiError(422, 'SUPPLIER_UNAVAILABLE', undefined, 'Pay Acme directly. Online payment isn\'t available for them.');
    const h = harness({ create: jest.fn(async () => { throw err; }) });
    const out = await runCreditPay(h.deps, ITEMS, 'UPI', 'k');
    expect(out.phase).toBe('error');
    expect(out.message).toBe('Pay Acme directly. Online payment isn\'t available for them.');
    expect(out.createError).toBe(err);
  });

  it('a dropped connection on create: error with a message, and the error is handed back', async () => {
    const err = new NetworkError('offline');
    const h = harness({ create: jest.fn(async () => { throw err; }) });
    const out = await runCreditPay(h.deps, ITEMS, 'UPI', 'k');
    expect(out.phase).toBe('error');
    expect(typeof out.message).toBe('string');
    expect(out.createError).toBe(err);
    expect(h.deps.checkout).not.toHaveBeenCalled();
  });

  // The idempotency key is kept only when the outcome is unknown. The flow hands the error
  // back so the caller can run useIdempotencyKey().settle(createError).
  it.each([
    ['a refusal', apiError(422, 'SUPPLIER_UNAVAILABLE'), true],
    ['a changed selection', apiError(409, 'CREDIT_PAY_SELECTION_CHANGED', { changedInvoiceIds: [11] }), true],
    ['a short wallet', apiError(422, 'WALLET_INSUFFICIENT_BALANCE', { shortBy: '1.0000' }), true],
    ['a 500', apiError(500, 'INTERNAL'), false],
    ['a dropped connection', new NetworkError('offline'), false],
    ['a request still in progress', apiError(409, 'IDEMPOTENT_REQUEST_IN_PROGRESS'), false],
  ])('%s: the key is %s by isDefinitiveFailure on createError', async (_n, err, definitive) => {
    const h = harness({ create: jest.fn(async () => { throw err; }) });
    const out = await runCreditPay(h.deps, ITEMS, 'UPI', 'k');
    expect(out.createError).toBe(err);
    expect(isDefinitiveFailure(out.createError)).toBe(definitive);
  });

  it('endings after a successful create carry no createError', async () => {
    const h = harness();
    expect((await runCreditPay(h.deps, ITEMS, 'UPI', 'k')).createError).toBeUndefined();
    const h2 = harness({ verify: jest.fn(async () => CREATED) });
    expect((await runCreditPay(h2.deps, ITEMS, 'UPI', 'k')).createError).toBeUndefined();
  });
});

describe('one run at a time', () => {
  it('a second tap while a run is in flight gets the first\'s result and starts nothing', async () => {
    let release: (a: CreditPayAttempt) => void = () => undefined;
    const create = jest.fn(() => new Promise<CreditPayAttempt>((resolve) => { release = resolve; }));
    const h = harness({ create });
    const flight = createSingleFlight<Awaited<ReturnType<typeof runCreditPay>>>();
    const run = () => flight.run(() => runCreditPay(h.deps, ITEMS, 'UPI', 'k'));

    const first = run();
    const second = run();
    expect(flight.busy).toBe(true);
    release(CREATED);
    const [a, b] = await Promise.all([first, second]);

    expect(create).toHaveBeenCalledTimes(1);
    expect(h.deps.checkout).toHaveBeenCalledTimes(1);
    expect(h.deps.verify).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(flight.busy).toBe(false);
  });
});

describe('what is sent', () => {
  it.each(['UPI', 'CARD', 'WALLET'] as CreditPayMethod[])('%s: create gets the items and key untouched', async (method) => {
    const h = harness({ create: jest.fn(async () => attempt({ status: method === 'WALLET' ? 'PAID' : 'CREATED', method })) });
    await runCreditPay(h.deps, ITEMS, method, 'the-key');
    expect(h.deps.create).toHaveBeenCalledWith(ITEMS, method, 'the-key');
    expect((h.deps.create as jest.Mock).mock.calls[0][0]).toBe(ITEMS);
  });
});
