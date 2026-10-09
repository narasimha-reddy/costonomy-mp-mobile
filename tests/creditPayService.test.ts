import {
  createCreditPayment, fetchCreditPayment, fetchPayableInvoices, quoteCreditPayment,
  selectionChangedIds, verifyCreditPayment,
} from '@/services/creditPay';
import { ApiError } from '@/lib/api/errors';
import type { PayItem } from '@/models/creditPay';

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

const ITEMS: PayItem[] = [{ invoiceId: 11, outstanding: '1500.0000' }, { invoiceId: 21, outstanding: '600.5000' }];

afterEach(() => jest.restoreAllMocks());

describe('fetchPayableInvoices', () => {
  it('GETs the outlet\'s payable invoices with the token', async () => {
    const payable = { outletId: 7, onlinePayEnabled: true, suppliers: [] };
    const fetchMock = mockFetch(jsonResponse(payable));
    expect(await fetchPayableInvoices('tok', 7)).toEqual(payable);
    const call = lastCall(fetchMock);
    expect(call.url).toContain('/api/v1/outlets/7/credit/payable-invoices');
    expect(call.init.method ?? 'GET').toBe('GET');
    expect(call.headers.Authorization).toBe('Bearer tok');
  });
});

describe('quoteCreditPayment', () => {
  it('POSTs the items and nothing else: no amount, no method, no total', async () => {
    const fetchMock = mockFetch(jsonResponse({ invoiceCount: 2, supplierCount: 2, amount: '2100.5000', walletBalance: null, methods: [] }));
    await quoteCreditPayment('tok', 7, ITEMS);
    const call = lastCall(fetchMock);
    expect(call.url).toContain('/api/v1/outlets/7/credit/payments/quote');
    expect(call.init.method).toBe('POST');
    expect(call.body).toEqual({ items: ITEMS });
    expect(Object.keys(call.body)).toEqual(['items']);
  });

  it('returns what the server computed', async () => {
    const quote = { invoiceCount: 2, supplierCount: 2, amount: '2100.5000', walletBalance: '5000.0000', methods: [] };
    mockFetch(jsonResponse(quote));
    expect(await quoteCreditPayment('tok', 7, ITEMS)).toEqual(quote);
  });
});

describe('createCreditPayment', () => {
  it.each(['UPI', 'CARD', 'WALLET'] as const)('%s: POSTs items and method with the Idempotency-Key header', async (method) => {
    const fetchMock = mockFetch(jsonResponse({ attemptId: 9, status: 'CREATED', method }, 201));
    const attempt = await createCreditPayment('tok', 7, ITEMS, method, 'key-1');
    const call = lastCall(fetchMock);
    expect(call.url).toMatch(/\/api\/v1\/outlets\/7\/credit\/payments$/);
    expect(call.init.method).toBe('POST');
    expect(call.headers['Idempotency-Key']).toBe('key-1');
    expect(call.body).toEqual({ items: ITEMS, method });
    expect(attempt.attemptId).toBe(9);
  });

  it('never sends an amount or a total, only what the server showed', async () => {
    const fetchMock = mockFetch(jsonResponse({ attemptId: 9 }, 201));
    await createCreditPayment('tok', 7, ITEMS, 'UPI', 'k');
    const body = lastCall(fetchMock).body;
    expect(Object.keys(body).sort()).toEqual(['items', 'method']);
    expect(body.items).toEqual([
      { invoiceId: 11, outstanding: '1500.0000' },
      { invoiceId: 21, outstanding: '600.5000' },
    ]);
  });

  it('surfaces a refusal untouched, with its code and details', async () => {
    mockFetch(jsonResponse({ code: 'WALLET_INSUFFICIENT_BALANCE', message: 'Not enough in the wallet.', details: { shortBy: '12.5000' } }, 422));
    await expect(createCreditPayment('tok', 7, ITEMS, 'WALLET', 'k')).rejects.toMatchObject({
      code: 'WALLET_INSUFFICIENT_BALANCE', status: 422, details: { shortBy: '12.5000' },
    });
  });
});

describe('verifyCreditPayment', () => {
  it('POSTs the Razorpay proof under the server\'s field names', async () => {
    const fetchMock = mockFetch(jsonResponse({ attemptId: 9, status: 'PAID' }));
    const attempt = await verifyCreditPayment('tok', 7, 9, { paymentId: 'pay_1', signature: 'sig_1' });
    const call = lastCall(fetchMock);
    expect(call.url).toContain('/api/v1/outlets/7/credit/payments/9/verify');
    expect(call.init.method).toBe('POST');
    expect(call.body).toEqual({ razorpayPaymentId: 'pay_1', razorpaySignature: 'sig_1' });
    expect(attempt.status).toBe('PAID');
  });

  it('sends no signature field value when checkout gave none', async () => {
    const fetchMock = mockFetch(jsonResponse({ attemptId: 9, status: 'PAID' }));
    await verifyCreditPayment('tok', 7, 9, { paymentId: 'pay_1' });
    const body = lastCall(fetchMock).body;
    expect(body.razorpayPaymentId).toBe('pay_1');
    expect(body.razorpaySignature ?? null).toBeNull();
  });
});

describe('fetchCreditPayment', () => {
  it('GETs one attempt', async () => {
    const fetchMock = mockFetch(jsonResponse({ attemptId: 9, status: 'CREATED' }));
    expect((await fetchCreditPayment('tok', 7, 9)).attemptId).toBe(9);
    const call = lastCall(fetchMock);
    expect(call.url).toMatch(/\/api\/v1\/outlets\/7\/credit\/payments\/9$/);
    expect(call.init.method ?? 'GET').toBe('GET');
  });
});

describe('selectionChangedIds', () => {
  const err = (code: string, details?: Record<string, unknown>, status = 409) =>
    new ApiError({ code, message: 'm', status, details });

  it('reads the changed invoice ids from a CREDIT_PAY_SELECTION_CHANGED error', () => {
    expect(selectionChangedIds(err('CREDIT_PAY_SELECTION_CHANGED', { changedInvoiceIds: [11, 21] }))).toEqual([11, 21]);
  });

  it('is null for any other error, for a non-error, and for nothing', () => {
    expect(selectionChangedIds(err('SOMETHING_ELSE', { changedInvoiceIds: [11] }))).toBeNull();
    expect(selectionChangedIds(new Error('boom'))).toBeNull();
    expect(selectionChangedIds(null)).toBeNull();
    expect(selectionChangedIds(undefined)).toBeNull();
  });

  it('is an empty list, not a crash, when the details are missing', () => {
    expect(selectionChangedIds(err('CREDIT_PAY_SELECTION_CHANGED'))).toEqual([]);
    expect(selectionChangedIds(err('CREDIT_PAY_SELECTION_CHANGED', { changedInvoiceIds: 'x' }))).toEqual([]);
  });
});
