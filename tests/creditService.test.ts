import {
  fetchAgreementClaims, fetchCreditAttention, fetchCreditInvoice, fetchCreditStatement, isClaimStateError,
  isOverpaymentError, isShortBalanceError, repayFromWallet, submitClaim, withdrawClaim,
} from '@/services/credit';
import { ApiError } from '@/lib/api/errors';

function jsonResponse(data: unknown, status = 200) {
  const body = status < 300 ? { data, error: null, meta: {} } : { data: null, error: data, meta: {} };
  return {
    status, ok: status < 300, headers: { get: () => null }, text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function mockFetch(...responses: Response[]) {
  const fn = jest.fn(async () => responses.shift() as Response);
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

function lastCall(fn: jest.Mock) {
  const [url, init] = fn.mock.calls[fn.mock.calls.length - 1] as unknown as [string, RequestInit];
  return {
    url, init, headers: init.headers as Record<string, string>,
    body: init.body ? JSON.parse(init.body as string) : undefined,
  };
}

afterEach(() => jest.restoreAllMocks());

describe('credit services', () => {
  it('fetches attention for the outlet', async () => {
    const fn = mockFetch(jsonResponse({ overdue: true, dueSoon: false }));
    await expect(fetchCreditAttention('t', 7)).resolves.toEqual({ overdue: true, dueSoon: false });
    const c = lastCall(fn);
    expect(c.url).toContain('/api/v1/outlets/7/credit/attention');
    expect(c.init.method).toBe('GET');
    expect(c.headers.Authorization).toBe('Bearer t');
  });

  it('fetches one invoice', async () => {
    const fn = mockFetch(jsonResponse({ id: 9 }));
    await fetchCreditInvoice('t', 9);
    expect(lastCall(fn).url).toContain('/api/v1/credit/invoices/9');
  });

  it('fetches a statement with from and to', async () => {
    const fn = mockFetch(jsonResponse({ agreementId: 4, lines: [] }));
    await fetchCreditStatement('t', 4, { from: '2026-09-01', to: '2026-09-30' });
    expect(lastCall(fn).url).toContain(
      '/api/v1/credit/agreements/4/statement?from=2026-09-01&to=2026-09-30');
  });

  it('fetches a statement with no query string when there is no range', async () => {
    const fn = mockFetch(jsonResponse({ agreementId: 4, lines: [] }), jsonResponse({ agreementId: 4, lines: [] }));
    await fetchCreditStatement('t', 4);
    expect(lastCall(fn).url.endsWith('/api/v1/credit/agreements/4/statement')).toBe(true);
    await fetchCreditStatement('t', 4, {});
    expect(lastCall(fn).url).not.toContain('?');
  });

  it('sends only the bound that was given', async () => {
    const fn = mockFetch(jsonResponse({ lines: [] }), jsonResponse({ lines: [] }));
    await fetchCreditStatement('t', 4, { from: '2026-09-01' });
    expect(lastCall(fn).url.endsWith('/statement?from=2026-09-01')).toBe(true);
    await fetchCreditStatement('t', 4, { to: '2026-09-30' });
    expect(lastCall(fn).url.endsWith('/statement?to=2026-09-30')).toBe(true);
  });

  it('submits a claim with the key and body', async () => {
    const fn = mockFetch(jsonResponse({ id: 8, status: 'SUBMITTED' }, 201));
    const body = { amount: 400, method: 'UPI' as const, reference: 'U1', paidOn: '2026-10-04', note: 'n' };
    await expect(submitClaim('t', 55, body, 'key-9')).resolves.toEqual({ id: 8, status: 'SUBMITTED' });
    const c = lastCall(fn);
    expect(c.url).toContain('/api/v1/credit/invoices/55/claims');
    expect(c.init.method).toBe('POST');
    expect(c.headers['Idempotency-Key']).toBe('key-9');
    expect(c.body).toEqual(body);
  });

  it('withdraws a claim with no body', async () => {
    const fn = mockFetch(jsonResponse({ id: 8, status: 'WITHDRAWN' }));
    await withdrawClaim('t', 8);
    const c = lastCall(fn);
    expect(c.url).toContain('/api/v1/credit/claims/8/withdraw');
    expect(c.init.method).toBe('POST');
    expect(c.init.body).toBeUndefined();
  });

  it('lists an agreement\'s claims, optionally by status', async () => {
    const fn = mockFetch(jsonResponse([]), jsonResponse([]));
    await fetchAgreementClaims('t', 3);
    expect(lastCall(fn).url.endsWith('/api/v1/credit/agreements/3/claims')).toBe(true);
    await fetchAgreementClaims('t', 3, 'SUBMITTED');
    expect(lastCall(fn).url.endsWith('/claims?status=SUBMITTED')).toBe(true);
  });

  it('recognises a claim-state refusal and a missing invoice, and nothing else', async () => {
    mockFetch(jsonResponse({ code: 'CREDIT_CLAIM_STATE', message: 'x' }, 409));
    const state = await submitClaim('t', 1, { amount: 1, method: 'CASH', paidOn: '2026-10-01' }, 'k').catch((e) => e);
    expect(isClaimStateError(state)).toBe(true);
    mockFetch(jsonResponse({ code: 'NOT_FOUND', message: 'x' }, 404));
    const gone = await withdrawClaim('t', 1).catch((e) => e);
    expect(isClaimStateError(gone)).toBe(true);
    mockFetch(jsonResponse({ code: 'VALIDATION_ERROR', message: 'x' }, 422));
    const other = await withdrawClaim('t', 1).catch((e) => e);
    expect(isClaimStateError(other)).toBe(false);
    expect(isClaimStateError(new Error('x'))).toBe(false);
  });

  it('surfaces the claimable amount on an overpayment', async () => {
    mockFetch(jsonResponse({ code: 'CREDIT_OVERPAYMENT', message: 'x', details: { outstanding: 400 } }, 422));
    const error = await submitClaim('t', 1, { amount: 900, method: 'CASH', paidOn: '2026-10-01' }, 'k').catch((e) => e);
    expect(isOverpaymentError(error)).toEqual({ outstanding: 400 });
  });

  it('repays from the wallet with the key and body', async () => {
    const fn = mockFetch(jsonResponse({ repaymentId: 1 }, 201));
    await repayFromWallet('t', 4, { amount: 250.5, invoiceIds: [1, 2] }, 'key-1');
    const c = lastCall(fn);
    expect(c.url).toContain('/api/v1/credit/agreements/4/wallet-repayments');
    expect(c.init.method).toBe('POST');
    expect(c.headers['Idempotency-Key']).toBe('key-1');
    expect(c.body).toEqual({ amount: 250.5, invoiceIds: [1, 2] });
  });

  it('surfaces the short-balance details to the caller', async () => {
    mockFetch(jsonResponse({
      code: 'WALLET_INSUFFICIENT_BALANCE', message: 'x', details: { shortBy: 40, balance: 10 },
    }, 422));
    const error = await repayFromWallet('t', 4, { amount: 50 }, 'k').catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(isShortBalanceError(error)).toEqual({ shortBy: 40, balance: 10 });
    expect(isOverpaymentError(error)).toBeNull();
  });

  it('surfaces the overpayment details to the caller', async () => {
    mockFetch(jsonResponse({
      code: 'CREDIT_OVERPAYMENT', message: 'x', details: { outstanding: 120 },
    }, 422));
    const error = await repayFromWallet('t', 4, { amount: 500 }, 'k').catch((e) => e);
    expect(isOverpaymentError(error)).toEqual({ outstanding: 120 });
    expect(isShortBalanceError(error)).toBeNull();
  });

  it('error helpers ignore other errors and malformed details', () => {
    expect(isShortBalanceError(new Error('x'))).toBeNull();
    expect(isShortBalanceError(undefined)).toBeNull();
    const bad = new ApiError({
      code: 'WALLET_INSUFFICIENT_BALANCE', message: 'x', status: 422, details: { shortBy: 'a' },
    });
    expect(isShortBalanceError(bad)).toBeNull();
    const other = new ApiError({ code: 'FORBIDDEN', message: 'x', status: 403 });
    expect(isOverpaymentError(other)).toBeNull();
  });
});
