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
