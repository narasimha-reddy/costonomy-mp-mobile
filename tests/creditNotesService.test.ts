import {
  fetchCreditNotes, fetchRefundsDue, issueCreditNote, markRefundDue, writeOffInvoice, writeOffLine,
} from '@/services/credit';

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

describe('credit note, write-off and refund services', () => {
  it('issues a credit note with the key and the amount as a string', async () => {
    const fn = mockFetch(jsonResponse({ id: 1 }, 201));
    await issueCreditNote('t', 11, { amount: '2100.00', reasonCode: 'PRICE', note: 'x' }, 'key-1');
    const c = lastCall(fn);
    expect(c.url).toContain('/api/v1/credit/invoices/11/credit-notes');
    expect(c.init.method).toBe('POST');
    expect(c.headers['Idempotency-Key']).toBe('key-1');
    expect(c.body).toEqual({ amount: '2100.00', reasonCode: 'PRICE', note: 'x' });
  });

  it('lists a line\'s credit notes by page', async () => {
    const fn = mockFetch(jsonResponse({ items: [], page: 1, size: 20, total: 0, hasNext: false }));
    await fetchCreditNotes('t', 3, { page: 1, size: 20 });
    expect(lastCall(fn).url).toContain('/api/v1/credit/agreements/3/credit-notes?page=1&size=20');
  });

  it('writes off an invoice and a line, each with its key', async () => {
    const fn = mockFetch(jsonResponse({}), jsonResponse({}));
    await writeOffInvoice('t', 11, { reason: 'Closed down', keepLineOpen: true }, 'k-a');
    let c = lastCall(fn);
    expect(c.url).toContain('/api/v1/credit/invoices/11/write-off');
    expect(c.headers['Idempotency-Key']).toBe('k-a');
    expect(c.body).toEqual({ reason: 'Closed down', keepLineOpen: true });
    await writeOffLine('t', 3, { reason: 'Closed down', amount: '2000.00' }, 'k-b');
    c = lastCall(fn);
    expect(c.url).toContain('/api/v1/credit/agreements/3/write-off');
    expect(c.headers['Idempotency-Key']).toBe('k-b');
    expect(c.body).toEqual({ reason: 'Closed down', amount: '2000.00' });
  });

  it('lists refunds due for a store, with the status when asked', async () => {
    const fn = mockFetch(jsonResponse([]), jsonResponse([]));
    await fetchRefundsDue('t', 5, 'OPEN');
    expect(lastCall(fn).url).toContain('/api/v1/supplier-stores/5/credit/refunds-due?status=OPEN');
    await fetchRefundsDue('t', 5);
    expect(lastCall(fn).url).toMatch(/refunds-due$/);
  });

  it('marks a refund as refunded with an optional note and no key', async () => {
    const fn = mockFetch(jsonResponse({ id: 9 }), jsonResponse({ id: 9 }));
    await markRefundDue('t', 9, 'Sent by UPI');
    let c = lastCall(fn);
    expect(c.url).toContain('/api/v1/credit/refunds-due/9/mark-refunded');
    expect(c.init.method).toBe('POST');
    expect(c.body).toEqual({ note: 'Sent by UPI' });
    await markRefundDue('t', 9);
    c = lastCall(fn);
    expect(c.body).toEqual({});
  });
});
