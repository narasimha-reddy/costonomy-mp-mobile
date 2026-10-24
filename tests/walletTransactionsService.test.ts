import { fetchWalletStatement, fetchWalletTransactions, mapEntry, mapTransactionsPage } from '@/services/wallet';
import { ApiError } from '@/lib/api/errors';
import { registerTokenRenewal } from '@/lib/api/session-bridge';

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

function fileResponse(disposition: string | null, bytes = 'PDFDATA') {
  return {
    status: 200,
    ok: true,
    headers: { get: (h: string) => (h.toLowerCase() === 'content-disposition' ? disposition : null) },
    blob: async () => ({ size: bytes.length, type: 'application/pdf' }) as unknown as Blob,
    text: async () => bytes,
  } as unknown as Response;
}

function mockFetch(...responses: Response[]) {
  const fn = jest.fn(async () => responses.shift() as Response);
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

function lastCall(fn: jest.Mock) {
  const [url, init] = fn.mock.calls[fn.mock.calls.length - 1] as unknown as [string, RequestInit];
  return { url, headers: (init?.headers ?? {}) as Record<string, string> };
}

afterEach(() => {
  jest.restoreAllMocks();
  registerTokenRenewal(null);
});

const RAW = {
  id: 7, key: 'L7', direction: 'CREDIT', kind: 'TOP_UP', amount: '500.0000', balanceAfter: '1500.0000',
  supplierOrderId: null, reason: null, status: 'COMPLETED', refundStatus: null,
  instrument: 'Card •1007', at: '2026-09-28T10:00:00Z',
};

describe('mapEntry', () => {
  it('keeps a full row', () => {
    expect(mapEntry(RAW)).toEqual({ ...RAW, bill: null });
  });

  it('leaves the key off when the server sends none', () => {
    expect(mapEntry({ ...RAW, key: undefined }).key).toBeUndefined();
  });

  it('accepts money as JSON numbers and turns them into strings', () => {
    const e = mapEntry({ ...RAW, amount: 500.5, balanceAfter: 1500 });
    expect(e.amount).toBe('500.5');
    expect(e.balanceAfter).toBe('1500');
  });

  it('tolerates an older API: no status, instrument or balance', () => {
    const e = mapEntry({ id: 1, direction: 'DEBIT', kind: 'ORDER_PAYMENT', amount: '10', at: '2026-09-01T00:00:00Z' });
    expect(e.status).toBeUndefined();
    expect(e.instrument).toBeNull();
    expect(e.balanceAfter).toBeNull();
    expect(e.supplierOrderId).toBeNull();
  });

  it('ignores a status it does not know and a blank instrument', () => {
    const e = mapEntry({ ...RAW, status: 'SOMETHING_NEW', instrument: '  ' });
    expect(e.status).toBeUndefined();
    expect(e.instrument).toBeNull();
  });
});

describe('mapTransactionsPage', () => {
  it('maps a full page, money as numbers or strings', () => {
    const page = mapTransactionsPage({
      items: [RAW],
      monthTotals: [{ month: '2026-09', added: 500, spent: '120.0000' }],
      availableMonths: ['2026-09', '2026-08'],
      nextCursor: 'abc',
    });
    expect(page.items).toHaveLength(1);
    expect(page.monthTotals).toEqual([{ month: '2026-09', added: '500', spent: '120.0000' }]);
    expect(page.availableMonths).toEqual(['2026-09', '2026-08']);
    expect(page.nextCursor).toBe('abc');
  });

  it('tolerates missing monthTotals and availableMonths, and a null cursor', () => {
    const page = mapTransactionsPage({ items: [RAW], nextCursor: null });
    expect(page.monthTotals).toEqual([]);
    expect(page.availableMonths).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });

  it('drops a month total with no usable figure', () => {
    const page = mapTransactionsPage({
      items: [], monthTotals: [{ month: '2026-09', spent: null }, { spent: '1' }, { month: '2026-08', spent: 'x' }],
    });
    expect(page.monthTotals).toEqual([]);
  });

  it('treats an empty cursor as the end, and an empty body as an empty page', () => {
    expect(mapTransactionsPage({ items: [], nextCursor: '' }).nextCursor).toBeNull();
    expect(mapTransactionsPage(undefined)).toEqual({
      items: [], monthTotals: [], availableMonths: [], nextCursor: null, billSummary: null,
    });
  });
});

describe('fetchWalletTransactions', () => {
  it('asks for the page with the filters and cursor in the query', async () => {
    const fn = mockFetch(jsonResponse({ items: [RAW], nextCursor: null }));
    const page = await fetchWalletTransactions('tok', 4, {
      filters: { months: ['2026-09'], categories: ['TOP_UP'], instruments: ['CARD'], statuses: ['RETURNED'], bills: [] },
      cursor: 'c1', size: 20,
    });
    const { url, headers } = lastCall(fn);
    expect(url).toContain('/api/v1/outlets/4/wallet/transactions?months=2026-09&kinds=TOP_UP&statuses=RETURNED&cursor=c1&size=20');
    expect(headers.Authorization).toBe('Bearer tok');
    expect(page.items[0]!.id).toBe(7);
  });

  it('with no filters has no query string', async () => {
    const fn = mockFetch(jsonResponse({ items: [] }));
    await fetchWalletTransactions('tok', 4);
    expect(lastCall(fn).url).toMatch(/wallet\/transactions$/);
  });
});

describe('fetchWalletStatement', () => {
  it('returns the file with the name the server gave', async () => {
    const fn = mockFetch(fileResponse('attachment; filename="wallet-2026-09.pdf"'));
    const file = await fetchWalletStatement('tok', 4, { kind: 'range', range: 'LAST_30', format: 'PDF' });
    expect(file.filename).toBe('wallet-2026-09.pdf');
    expect(file.blob.size).toBe(7);
    const { url, headers } = lastCall(fn);
    expect(url).toContain('/api/v1/outlets/4/wallet/statement?range=LAST_30&format=PDF');
    expect(headers.Authorization).toBe('Bearer tok');
  });

  it('names the file itself when the server does not', async () => {
    mockFetch(fileResponse(null));
    const file = await fetchWalletStatement('tok', 4, { kind: 'range', range: 'LAST_30', format: 'CSV' });
    expect(file.filename).toMatch(/^wallet-statement-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it("throws the server's own message when it refuses", async () => {
    mockFetch(jsonResponse({ code: 'STATEMENT_TOO_LARGE', message: 'Too many transactions. Choose a shorter period.' }, 422));
    await expect(fetchWalletStatement('tok', 4, { kind: 'range', range: 'LAST_365', format: 'PDF' }))
      .rejects.toMatchObject({ name: 'ApiError', message: 'Too many transactions. Choose a shorter period.', status: 422 });
  });

  it('gives a plain message when the error has no JSON body', async () => {
    mockFetch({ status: 502, ok: false, headers: { get: () => null }, text: async () => '<html>' } as unknown as Response);
    const error = await fetchWalletStatement('tok', 4, { kind: 'range', range: 'LAST_30', format: 'PDF' })
      .catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).toMatch(/Something went wrong/);
  });

  it('renews the token once on a 401 and retries', async () => {
    registerTokenRenewal(async () => 'fresh');
    const calls: string[] = [];
    global.fetch = jest.fn(async (_url: unknown, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string>).Authorization ?? '';
      calls.push(auth);
      return auth === 'Bearer fresh'
        ? fileResponse('attachment; filename=a.pdf')
        : jsonResponse({ code: 'UNAUTHENTICATED', message: 'expired' }, 401);
    }) as unknown as typeof fetch;
    const file = await fetchWalletStatement('old', 4, { kind: 'range', range: 'LAST_30', format: 'PDF' });
    expect(file.filename).toBe('a.pdf');
    expect(calls).toEqual(['Bearer old', 'Bearer fresh']);
  });

  it('reports a network failure', async () => {
    global.fetch = jest.fn(async () => { throw new TypeError('offline'); }) as unknown as typeof fetch;
    await expect(fetchWalletStatement('tok', 4, { kind: 'range', range: 'LAST_30', format: 'PDF' }))
      .rejects.toMatchObject({ name: 'NetworkError' });
  });
});

describe('bill fields', () => {
  it('maps a known bill status and tolerates anything else as no bill', () => {
    expect(mapEntry({ ...RAW, bill: { status: 'PENDING' } }).bill).toEqual({ status: 'PENDING' });
    expect(mapEntry({ ...RAW, bill: { status: 'UNREADABLE', extra: 1 } }).bill).toEqual({ status: 'UNREADABLE' });
    expect(mapEntry({ ...RAW, bill: { status: 'SOMETHING_NEW' } }).bill).toBeNull();
    expect(mapEntry({ ...RAW, bill: { status: null } }).bill).toBeNull();
    expect(mapEntry({ ...RAW, bill: 'PENDING' }).bill).toBeNull();
    expect(mapEntry({ ...RAW, bill: null }).bill).toBeNull();
    expect(mapEntry(RAW).bill).toBeNull();
  });

  it('keeps billSummary only when all three counts are usable', () => {
    const page = (billSummary: unknown) => mapTransactionsPage({ items: [], billSummary }).billSummary;
    expect(page({ pending: 2, reading: 0, unreadable: 1 })).toEqual({ pending: 2, reading: 0, unreadable: 1 });
    expect(page({ pending: 2, reading: 0 })).toBeNull();
    expect(page({ pending: -1, reading: 0, unreadable: 0 })).toBeNull();
    expect(page({ pending: '2', reading: 0, unreadable: 0 })).toBeNull();
    expect(page({ pending: NaN, reading: 0, unreadable: 0 })).toBeNull();
    expect(page(null)).toBeNull();
    expect(page('x')).toBeNull();
    expect(mapTransactionsPage({ items: [] }).billSummary).toBeNull();
  });

  it('keeps billsPending on a month only when it is a number of zero or more', () => {
    const totals = mapTransactionsPage({
      items: [],
      monthTotals: [
        { month: '2026-09', spent: '1', billsPending: 3 },
        { month: '2026-08', spent: '1', billsPending: 0 },
        { month: '2026-07', spent: '1', billsPending: -2 },
        { month: '2026-06', spent: '1', billsPending: 'many' },
        { month: '2026-05', spent: '1' },
      ],
    }).monthTotals;
    expect(totals.map((t) => t.billsPending)).toEqual([3, 0, undefined, undefined, undefined]);
    expect('billsPending' in totals[2]!).toBe(false);
  });

  it('sends bills to the server along with the other filters', async () => {
    const fn = mockFetch(jsonResponse({ items: [] }));
    await fetchWalletTransactions('tok', 4, {
      filters: { months: ['2026-09'], categories: [], instruments: [], statuses: ['COMPLETED'], bills: ['PENDING', 'ADDED'] },
      cursor: 'c1',
    });
    expect(lastCall(fn).url).toContain('?months=2026-09&statuses=COMPLETED&bills=PENDING,ADDED&cursor=c1');
  });
});
