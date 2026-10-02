import { confirmTopUp, createTopUp, fetchTopUpStatus, fetchWallet, mapWallet } from '@/services/wallet';
import type { Wallet } from '@/models/wallet';

function jsonResponse(data: unknown, status = 200) {
  const body = status < 300
    ? { data, error: null, meta: {} }
    : { data: null, error: data, meta: {} };
  return {
    status,
    ok: status < 300,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const WALLET = {
  outletId: 1, balance: '1000.0000', currency: 'INR', status: 'ACTIVE', recent: [],
};
const LIMITS = {
  maxBalance: '200000.0000', monthlyTopUpLimit: '100000.0000', addedThisMonth: '500.0000',
  remainingThisMonth: '99500.0000', minTopUp: '10.0000', maxTopUp: '50000.0000',
};

function mockFetch(...responses: Response[]) {
  const fn = jest.fn(async () => responses.shift() as Response);
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

function lastCall(fn: jest.Mock) {
  const [url, init] = fn.mock.calls[fn.mock.calls.length - 1] as unknown as [string, RequestInit];
  return { url, init, headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(init.body as string) : undefined };
}

afterEach(() => jest.restoreAllMocks());

describe('fetchWallet limits', () => {
  it('keeps limits when all six are present', async () => {
    mockFetch(jsonResponse({ ...WALLET, limits: LIMITS }));
    const wallet = await fetchWallet('t', 1);
    expect(wallet.limits).toEqual(LIMITS);
    expect(wallet.balance).toBe('1000.0000');
  });

  it('tolerates an older API with no limits', async () => {
    mockFetch(jsonResponse(WALLET));
    const wallet = await fetchWallet('t', 1);
    expect(wallet.limits).toBeUndefined();
    expect(wallet.balance).toBe('1000.0000');
  });

  it('treats null, partial or unreadable limits as unknown', () => {
    expect(mapWallet({ ...WALLET, limits: null } as unknown as Wallet).limits).toBeUndefined();
    expect(mapWallet({ ...WALLET, limits: { maxBalance: '1' } } as unknown as Wallet).limits).toBeUndefined();
    expect(mapWallet({ ...WALLET, limits: { ...LIMITS, minTopUp: 'abc' } } as unknown as Wallet).limits).toBeUndefined();
    expect(mapWallet({ ...WALLET, limits: { ...LIMITS, maxTopUp: null } } as unknown as Wallet).limits).toBeUndefined();
  });

  it('accepts numeric limits and stringifies them', () => {
    const wallet = mapWallet({ ...WALLET, limits: { ...LIMITS, minTopUp: 10 } } as unknown as Wallet);
    expect(wallet.limits?.minTopUp).toBe('10');
  });
});

describe('createTopUp', () => {
  it('posts the amount with the idempotency key and maps checkout names', async () => {
    const fetchMock = mockFetch(jsonResponse({
      topUpId: 42, razorpayOrderId: 'order_A', keyId: 'rzp_test_k', amount: '500.00', currency: 'INR',
    }, 201));
    const top = await createTopUp('tok', 7, '500.00', 'key-1');

    const call = lastCall(fetchMock);
    expect(call.url).toContain('/api/v1/outlets/7/wallet/top-ups');
    expect(call.init.method).toBe('POST');
    expect(call.headers['Idempotency-Key']).toBe('key-1');
    expect(call.body).toEqual({ amount: '500.00' });
    expect(top).toEqual({
      topUpId: '42', providerOrderId: 'order_A', publicKey: 'rzp_test_k', amount: '500.00', currency: 'INR',
    });
  });

  it("surfaces the server's refusal untouched", async () => {
    mockFetch(jsonResponse({ code: 'TOP_UP_LIMIT', message: 'Over the monthly limit.' }, 422));
    await expect(createTopUp('tok', 7, '500.00', 'k')).rejects.toMatchObject({
      message: 'Over the monthly limit.', status: 422,
    });
  });
});

describe('confirmTopUp', () => {
  it('sends the provider proof and returns the wallet when credited', async () => {
    const fetchMock = mockFetch(jsonResponse({ ...WALLET, balance: '1500.0000', limits: LIMITS }));
    const result = await confirmTopUp('tok', 7, '42', { paymentId: 'pay_1', signature: 'sig' });

    const call = lastCall(fetchMock);
    expect(call.url).toContain('/outlets/7/wallet/top-ups/42/confirm');
    expect(call.body).toEqual({ razorpayPaymentId: 'pay_1', razorpaySignature: 'sig' });
    expect(result.pending).toBe(false);
    expect(result.wallet?.balance).toBe('1500.0000');
    expect(result.wallet?.limits).toEqual(LIMITS);
  });

  it('treats an answer with no wallet as still processing, not a failure', async () => {
    mockFetch(jsonResponse({ status: 'PROCESSING' }, 202));
    expect(await confirmTopUp('tok', 7, '42', { paymentId: 'p' })).toEqual({ pending: true, wallet: null });
  });

  it('treats an empty body as pending', async () => {
    mockFetch(jsonResponse(null, 200));
    expect((await confirmTopUp('tok', 7, '42', { paymentId: 'p' })).pending).toBe(true);
  });

  it('escapes the top-up id in the path', async () => {
    const fetchMock = mockFetch(jsonResponse({ status: 'PROCESSING' }));
    await confirmTopUp('tok', 7, 'a/b', { paymentId: 'p' });
    expect(lastCall(fetchMock).url).toContain('/top-ups/a%2Fb/confirm');
  });
});

describe('fetchTopUpStatus', () => {
  it('reads the status', async () => {
    const fetchMock = mockFetch(jsonResponse({ topUpId: 42, status: 'CREDITED' }));
    expect(await fetchTopUpStatus('tok', 7, '42')).toBe('CREDITED');
    const call = lastCall(fetchMock);
    expect(call.url).toContain('/outlets/7/wallet/top-ups/42');
    expect(call.init.method ?? 'GET').toBe('GET');
  });
});
