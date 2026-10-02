import { ApiError, NetworkError } from '@/lib/api/errors';
import { isDefinitiveFailure } from '@/lib/api/idempotency';
import { CheckoutDismissed, CheckoutFailed, CheckoutUnavailable } from '@/lib/payments/types';
import {
  checkoutRequest,
  createSingleFlight,
  PENDING_MESSAGE,
  POLL_DELAYS_MS,
  runTopUp,
  withTimeout,
  type TopUpDeps,
  type TopUpState,
} from '@/lib/wallet/topUpFlow';
import type { TopUpStatus, WalletTopUp } from '@/models/wallet';

const TOP: WalletTopUp = {
  topUpId: '9', providerOrderId: 'order_X', publicKey: 'rzp_test_k', amount: '500.00', currency: 'INR',
};

function harness(over: Partial<TopUpDeps> = {}) {
  const phases: TopUpState[] = [];
  const deps: TopUpDeps = {
    create: jest.fn(async () => TOP),
    checkout: jest.fn(async () => ({ paymentId: 'pay_1', signature: 'sig_1' })),
    confirm: jest.fn(async () => ({ pending: false, wallet: null })),
    status: jest.fn(async (): Promise<TopUpStatus> => 'CREATED'),
    sleep: jest.fn(async () => undefined),
    onPhase: (s) => phases.push(s),
    ...over,
  };
  return { deps, phases, names: () => phases.map((p) => p.phase) };
}

describe('runTopUp happy path', () => {
  it('goes creating, checkout, confirming, success and passes proof through', async () => {
    const h = harness();
    const out = await runTopUp(h.deps, '500.00', 'key-1');

    expect(out).toEqual({ phase: 'success', message: null });
    expect(h.names()).toEqual(['creating', 'checkout', 'confirming', 'success']);
    expect(h.deps.create).toHaveBeenCalledWith('500.00', 'key-1');
    expect(h.deps.confirm).toHaveBeenCalledWith(TOP, { paymentId: 'pay_1', signature: 'sig_1' });
  });
});

describe('runTopUp cancelled checkout', () => {
  it('is quiet: cancelled, no confirm, no error', async () => {
    const h = harness({ checkout: jest.fn(async () => { throw new CheckoutDismissed(); }) });
    const out = await runTopUp(h.deps, '500.00', 'k');

    expect(out.phase).toBe('cancelled');
    expect(h.deps.confirm).not.toHaveBeenCalled();
    expect(h.names()).not.toContain('error');
    expect(out.message).not.toMatch(/fail|error|wrong/i);
  });

  it('still asks the server first, and credits if the money did move', async () => {
    const h = harness({
      checkout: jest.fn(async () => { throw new CheckoutDismissed(); }),
      status: jest.fn(async (): Promise<TopUpStatus> => 'CREDITED'),
    });
    const out = await runTopUp(h.deps, '500.00', 'k');
    expect(out.phase).toBe('success');
    expect(h.deps.status).toHaveBeenCalledWith('9');
  });

  it('is cancelled even when the status check itself fails', async () => {
    const h = harness({
      checkout: jest.fn(async () => { throw new CheckoutDismissed(); }),
      status: jest.fn(async () => { throw new NetworkError('offline'); }),
    });
    expect((await runTopUp(h.deps, '500.00', 'k')).phase).toBe('cancelled');
  });
});

describe('runTopUp checkout problems', () => {
  it('says checkout is unavailable in its own words', async () => {
    const h = harness({ checkout: jest.fn(async () => { throw new CheckoutUnavailable('No window.'); }) });
    const out = await runTopUp(h.deps, '500.00', 'k');
    expect(out).toMatchObject({ phase: 'error', message: 'No window.' });
    expect(h.deps.confirm).not.toHaveBeenCalled();
  });

  it('a decline inside checkout is an error that still reassures about money', async () => {
    const h = harness({ checkout: jest.fn(async () => { throw new CheckoutFailed('Card declined.'); }) });
    const out = await runTopUp(h.deps, '500.00', 'k');
    expect(out.phase).toBe('error');
    expect(out.message).toContain('Card declined.');
    expect(out.message).toMatch(/If any money left your account/);
    expect(h.deps.confirm).not.toHaveBeenCalled();
  });
});

describe('runTopUp create failing', () => {
  it("shows the server's own message and hands back the error for the key", async () => {
    const refusal = new ApiError({ code: 'TOP_UP_LIMIT', message: 'That is over your monthly limit.', status: 422 });
    const h = harness({ create: jest.fn(async () => { throw refusal; }) });
    const out = await runTopUp(h.deps, '500.00', 'k');

    expect(out).toMatchObject({ phase: 'error', message: 'That is over your monthly limit.', createError: refusal });
    expect(h.deps.checkout).not.toHaveBeenCalled();
  });

  it('uses plain copy for a network failure, and opens no checkout', async () => {
    const h = harness({ create: jest.fn(async () => { throw new NetworkError('offline'); }) });
    const out = await runTopUp(h.deps, '500.00', 'k');
    expect(out.phase).toBe('error');
    expect(out.message).toMatch(/Could not start/);
    expect(h.deps.checkout).not.toHaveBeenCalled();
  });
});

describe('runTopUp after a payment was made: never "failed"', () => {
  const cases: [string, Partial<TopUpDeps>][] = [
    ['confirm rejects with a network error', { confirm: jest.fn(async () => { throw new NetworkError('x'); }) }],
    ['confirm rejects with a 500', { confirm: jest.fn(async () => { throw new ApiError({ code: 'X', message: 'boom', status: 500 }); }) }],
    ['confirm is refused with a 400', { confirm: jest.fn(async () => { throw new ApiError({ code: 'BAD', message: 'bad sig', status: 400 }); }) }],
    ['confirm times out', { confirm: jest.fn(async () => { throw new Error('timed out'); }) }],
    ['confirm answers still processing', { confirm: jest.fn(async () => ({ pending: true, wallet: null })) }],
  ];

  it.each(cases)('%s -> pending with the confirming message', async (_name, over) => {
    const h = harness(over);
    const out = await runTopUp(h.deps, '500.00', 'k');

    expect(out).toEqual({ phase: 'pending', message: PENDING_MESSAGE });
    expect(h.names()).not.toContain('error');
    expect(h.names()).not.toContain('cancelled');
    expect(PENDING_MESSAGE).toMatch(/confirming your payment/);
    expect(PENDING_MESSAGE).toMatch(/balance will update shortly/);
    expect(PENDING_MESSAGE).not.toMatch(/fail/i);
    // It asked the server every time it waited.
    expect(h.deps.status).toHaveBeenCalledTimes(POLL_DELAYS_MS.length);
    expect(h.deps.sleep).toHaveBeenCalledTimes(POLL_DELAYS_MS.length);
  });

  it('turns into success as soon as the server says CREDITED', async () => {
    const status = jest.fn<Promise<TopUpStatus>, [string]>()
      .mockResolvedValueOnce('CREATED').mockResolvedValueOnce('CREDITED');
    const h = harness({ confirm: jest.fn(async () => { throw new Error('timed out'); }), status });
    const out = await runTopUp(h.deps, '500.00', 'k');

    expect(out.phase).toBe('success');
    expect(status).toHaveBeenCalledTimes(2);
  });

  it('keeps asking through status errors, and stays pending', async () => {
    const h = harness({
      confirm: jest.fn(async () => { throw new Error('x'); }),
      status: jest.fn(async () => { throw new NetworkError('offline'); }),
    });
    expect((await runTopUp(h.deps, '500.00', 'k')).phase).toBe('pending');
  });

  it('says the money was returned if the server reports a refund', async () => {
    const h = harness({
      confirm: jest.fn(async () => { throw new Error('x'); }),
      status: jest.fn(async (): Promise<TopUpStatus> => 'REFUNDED'),
    });
    const out = await runTopUp(h.deps, '500.00', 'k');
    expect(out.message).toMatch(/returned/);
  });

  it('does not call the payment failed even if the server later says FAILED or EXPIRED', async () => {
    for (const status of ['FAILED', 'EXPIRED'] as TopUpStatus[]) {
      const h = harness({
        confirm: jest.fn(async () => { throw new Error('x'); }),
        status: jest.fn(async () => status),
      });
      expect((await runTopUp(h.deps, '500.00', 'k')).phase).toBe('pending');
    }
  });
});

describe('idempotency key after a failed create', () => {
  it('is kept for an unknown outcome so a retry reaches the same top-up', async () => {
    for (const caught of [new NetworkError('x'), new ApiError({ code: 'X', message: 'm', status: 503 })]) {
      const h = harness({ create: jest.fn(async () => { throw caught; }) });
      const out = await runTopUp(h.deps, '500.00', 'k');
      expect(isDefinitiveFailure(out.createError)).toBe(false);
    }
  });

  it('is dropped once the server has refused it', async () => {
    const refusal = new ApiError({ code: 'X', message: 'm', status: 422 });
    const h = harness({ create: jest.fn(async () => { throw refusal; }) });
    const out = await runTopUp(h.deps, '500.00', 'k');
    expect(isDefinitiveFailure(out.createError)).toBe(true);
  });
});

describe('createSingleFlight (double tap)', () => {
  it('a second tap during a run starts nothing and shares the first result', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const h = harness({ create: jest.fn(async () => { await gate; return TOP; }) });
    const flight = createSingleFlight<Awaited<ReturnType<typeof runTopUp>>>();

    const first = flight.run(() => runTopUp(h.deps, '500.00', 'same-key'));
    const second = flight.run(() => runTopUp(h.deps, '500.00', 'same-key'));
    expect(flight.busy).toBe(true);
    release();
    const [a, b] = await Promise.all([first, second]);

    expect(a).toBe(b);
    expect(h.deps.create).toHaveBeenCalledTimes(1);
    expect(h.deps.checkout).toHaveBeenCalledTimes(1);
    expect(flight.busy).toBe(false);
  });

  it('allows a new run once the first has finished', async () => {
    const flight = createSingleFlight<number>();
    let n = 0;
    await flight.run(async () => ++n);
    await flight.run(async () => ++n);
    expect(n).toBe(2);
  });

  it('is released after a rejection too', async () => {
    const flight = createSingleFlight<number>();
    await expect(flight.run(async () => { throw new Error('x'); })).rejects.toThrow();
    expect(flight.busy).toBe(false);
  });
});

describe('helpers', () => {
  it('builds the checkout window from the server order and key, with no amount', () => {
    const req = checkoutRequest(TOP, 'Mandi', 'theme-colour');
    expect(req).toMatchObject({ key: 'rzp_test_k', providerOrderId: 'order_X', merchantName: 'Mandi' });
    expect(req).not.toHaveProperty('amount');
  });

  it('withTimeout rejects a slow promise and passes a fast one', async () => {
    jest.useFakeTimers();
    const slow = withTimeout(new Promise<string>(() => undefined), 1000);
    const assertion = expect(slow).rejects.toThrow('timed out');
    jest.advanceTimersByTime(1000);
    await assertion;
    jest.useRealTimers();
    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
  });
});
