import { ApiError } from '@/lib/api/errors';
import { CheckoutDismissed, CheckoutUnavailable } from '@/lib/payments/types';
import { canPayNow, nextActionText, outcomeLabel, outcomeTone } from '@/lib/deliveryFunding/display';
import {
  fundingCheckoutRequest,
  PENDING_MESSAGE,
  POLL_DELAYS_MS,
  runFundingPayment,
  type FundingPayDeps,
  type FundingPayPhase,
} from '@/lib/deliveryFunding/payFlow';
import type { DeliveryFundingCheckout } from '@/models/deliveryFunding';

const CHECKOUT: DeliveryFundingCheckout = {
  deductionId: 7, razorpayOrderId: 'order_F', keyId: 'rzp_test_k', amount: '60.00', currency: 'INR',
};

function harness(over: Partial<FundingPayDeps> = {}) {
  const phases: FundingPayPhase[] = [];
  const deps: FundingPayDeps = {
    initiate: jest.fn(async () => CHECKOUT),
    checkout: jest.fn(async () => ({ paymentId: 'pay_1', signature: 'sig_1' })),
    confirm: jest.fn(async () => ({ deductionId: 7, status: 'PAID_DIRECTLY', paymentId: 'pay_1', amount: '60.00', paidAt: null })),
    isPaid: jest.fn(async () => false),
    sleep: jest.fn(async () => undefined),
    onPhase: (p) => phases.push(p),
    ...over,
  };
  return { deps, phases };
}

describe('runFundingPayment', () => {
  it('opens the charge, takes the payment, confirms it with the gateway proof, and is paid', async () => {
    const h = harness();
    const out = await runFundingPayment(h.deps);
    expect(out).toEqual({ phase: 'paid', message: null });
    expect(h.phases).toEqual(['opening', 'checkout', 'confirming', 'paid']);
    expect(h.deps.confirm).toHaveBeenCalledWith({ paymentId: 'pay_1', signature: 'sig_1' });
  });

  it('says why when the charge cannot be opened, and nothing was charged', async () => {
    const refusal = new ApiError({ code: 'X', message: 'Already paid.', status: 422 });
    const h = harness({ initiate: jest.fn(async () => { throw refusal; }) });
    const out = await runFundingPayment(h.deps);
    expect(out.phase).toBe('error');
    expect(out.message).toBe('Already paid.');
    expect(out.initiateError).toBe(refusal);
    expect(h.deps.checkout).not.toHaveBeenCalled();
  });

  it('treats a closed window as cancelled, quietly, once the server confirms nothing was paid', async () => {
    const h = harness({ checkout: jest.fn(async () => { throw new CheckoutDismissed(); }) });
    const out = await runFundingPayment(h.deps);
    expect(out.phase).toBe('cancelled');
    expect(h.deps.confirm).not.toHaveBeenCalled();
  });

  it('is paid, not cancelled, when the window closed after the money moved', async () => {
    const h = harness({
      checkout: jest.fn(async () => { throw new CheckoutDismissed(); }),
      isPaid: jest.fn(async () => true),
    });
    expect((await runFundingPayment(h.deps)).phase).toBe('paid');
  });

  it('reports an unavailable checkout as an error that says so', async () => {
    const h = harness({ checkout: jest.fn(async () => { throw new CheckoutUnavailable('Payments need the full app.'); }) });
    const out = await runFundingPayment(h.deps);
    expect(out).toEqual({ phase: 'error', message: 'Payments need the full app.' });
  });

  it.each([
    ['a 500', new ApiError({ code: 'X', message: 'boom', status: 500 })],
    ['a 400', new ApiError({ code: 'BAD', message: 'bad', status: 400 })],
    ['a dropped call', new Error('timed out')],
  ])('never says a payment failed when confirming ends in %s: it asks the server, then says it is being confirmed', async (_n, err) => {
    const h = harness({ confirm: jest.fn(async () => { throw err; }) });
    const out = await runFundingPayment(h.deps);
    expect(out).toEqual({ phase: 'pending', message: PENDING_MESSAGE });
    expect(h.deps.isPaid).toHaveBeenCalledTimes(POLL_DELAYS_MS.length);
    expect(h.phases).not.toContain('error');
  });

  it('becomes paid as soon as the server has recorded it while polling', async () => {
    const isPaid = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const h = harness({ confirm: jest.fn(async () => { throw new Error('x'); }), isPaid });
    expect((await runFundingPayment(h.deps)).phase).toBe('paid');
    expect(isPaid).toHaveBeenCalledTimes(2);
  });

  it('says the payment will be returned when the settlement had already taken the charge (409)', async () => {
    const taken = new ApiError({ code: 'PAYMENT_STATE_CONFLICT', message: 'Your payout already covered this charge.', status: 409 });
    const h = harness({ confirm: jest.fn(async () => { throw taken; }) });
    const out = await runFundingPayment(h.deps);
    expect(out.phase).toBe('error');
    expect(out.message).toContain('Your payout already covered this charge.');
    expect(out.message).toContain('returned');
  });
});

describe('what a line says and allows', () => {
  it('offers Pay now only on a charge the server says can be paid', () => {
    expect(canPayNow({ kind: 'DELIVERY_FUNDING', nextAction: 'PAY_DIRECTLY' })).toBe(true);
    expect(canPayNow({ kind: 'DELIVERY_FUNDING', nextAction: 'PAY_DIRECTLY_OR_DEDUCTED_FROM_NEXT_SETTLEMENT' })).toBe(true);
    expect(canPayNow({ kind: 'DELIVERY_FUNDING', nextAction: 'NONE' })).toBe(false);
    expect(canPayNow({ kind: 'DELIVERY_FUNDING_CREDIT', nextAction: 'PAY_DIRECTLY' })).toBe(false);
  });

  it('explains the two ways a charge ends, and says nothing for a finished one', () => {
    expect(nextActionText('PAY_DIRECTLY')).toContain('no payout');
    expect(nextActionText('PAY_DIRECTLY_OR_DEDUCTED_FROM_NEXT_SETTLEMENT')).toContain('next payout');
    expect(nextActionText('NONE')).toBeNull();
  });

  it('words every outcome, shows an unknown one as received, and only calls owed money for attention', () => {
    expect(outcomeLabel('TAKEN_FROM_SETTLEMENT')).toBe('Taken from a payout');
    expect(outcomeLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW');
    expect(outcomeTone('OWED')).toBe('warning');
    expect(outcomeTone('PAID_DIRECTLY')).toBe('success');
    expect(outcomeTone('WAIVED')).toBe('neutral');
  });

  it('builds the gateway window from the server order, with no amount of its own', () => {
    const req = fundingCheckoutRequest(CHECKOUT, 'Mandi', 'theme-colour');
    expect(req).toEqual({ key: 'rzp_test_k', providerOrderId: 'order_F', merchantName: 'Mandi', description: 'Delivery charge', themeColor: 'theme-colour' });
    expect(req).not.toHaveProperty('amount');
  });
});
