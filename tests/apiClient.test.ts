import { apiRequest } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { registerTokenRenewal } from '@/lib/api/session-bridge';

function jsonResponse(body: unknown, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const UNAUTHENTICATED = {
  data: null,
  error: { code: 'UNAUTHENTICATED', message: 'Please sign in to continue.' },
  meta: {},
};

describe('apiRequest token renewal (D-058)', () => {
  afterEach(() => {
    registerTokenRenewal(null);
    jest.restoreAllMocks();
  });

  it('renews once on a 401 and repeats the call with the new token', async () => {
    const seen: (string | undefined)[] = [];
    const fetchMock = jest.fn(async (_url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      seen.push(headers.Authorization);
      return seen.length === 1
        ? jsonResponse(UNAUTHENTICATED, 401)
        : jsonResponse({ data: { ok: true }, error: null, meta: {} });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    registerTokenRenewal(async () => 'fresh-token');

    await expect(apiRequest('/x', { token: 'stale-token' })).resolves.toEqual({ ok: true });
    expect(seen).toEqual(['Bearer stale-token', 'Bearer fresh-token']);
  });

  it('renews for a POST too — the server never saw the rejected request', async () => {
    // The whole reason this is safe for a non-idempotent method: a request
    // refused at authentication cannot have had an effect to repeat.
    let calls = 0;
    global.fetch = jest.fn(async () => {
      calls += 1;
      return calls === 1
        ? jsonResponse(UNAUTHENTICATED, 401)
        : jsonResponse({ data: { placed: true }, error: null, meta: {} });
    }) as unknown as typeof fetch;
    registerTokenRenewal(async () => 'fresh-token');

    await expect(apiRequest('/orders', { method: 'POST', token: 'stale' }))
      .resolves.toEqual({ placed: true });
    expect(calls).toBe(2);
  });

  it('sends the SAME Idempotency-Key on the call refused with 401 and on its repeat after renewal (R21)', async () => {
    const seen: { auth?: string; key?: string; body?: string }[] = [];
    global.fetch = jest.fn(async (_url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      seen.push({ auth: headers.Authorization, key: headers['Idempotency-Key'], body: init.body as string });
      return seen.length === 1
        ? jsonResponse(UNAUTHENTICATED, 401)
        : jsonResponse({ data: { paid: true }, error: null, meta: {} });
    }) as unknown as typeof fetch;
    registerTokenRenewal(async () => 'fresh-token');

    await expect(apiRequest('/pay', {
      method: 'POST', token: 'stale', idempotencyKey: 'key-123', body: { amount: 500 },
    })).resolves.toEqual({ paid: true });
    expect(seen).toHaveLength(2);
    expect(seen[0]?.key).toBe('key-123');
    expect(seen[1]?.key).toBe('key-123');
    expect(seen[1]?.auth).toBe('Bearer fresh-token');
    expect(seen[1]?.body).toBe(seen[0]?.body);
  });

  it('gives up after one renewal rather than looping', async () => {
    let calls = 0;
    global.fetch = jest.fn(async () => {
      calls += 1;
      return jsonResponse(UNAUTHENTICATED, 401);
    }) as unknown as typeof fetch;
    registerTokenRenewal(async () => 'fresh-but-also-rejected');

    await expect(apiRequest('/x', { token: 'stale' })).rejects.toBeInstanceOf(ApiError);
    expect(calls).toBe(2);
  });

  it('surfaces the 401 when no renewal is registered', async () => {
    // A unit test, or a call made before the session provider mounts. Hanging
    // or retrying would both be worse than reporting what the server said.
    let calls = 0;
    global.fetch = jest.fn(async () => {
      calls += 1;
      return jsonResponse(UNAUTHENTICATED, 401);
    }) as unknown as typeof fetch;

    await expect(apiRequest('/x', { token: 'stale' })).rejects.toBeInstanceOf(ApiError);
    expect(calls).toBe(1);
  });

  it('does not renew when the call carried no token', async () => {
    let calls = 0;
    global.fetch = jest.fn(async () => {
      calls += 1;
      return jsonResponse(UNAUTHENTICATED, 401);
    }) as unknown as typeof fetch;
    registerTokenRenewal(async () => 'fresh-token');

    await expect(apiRequest('/auth/refresh', { method: 'POST' })).rejects.toBeInstanceOf(ApiError);
    expect(calls).toBe(1);
  });
});
