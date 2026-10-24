import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SAVE_RETRY_DELAY_MS, useSaveInvoiceReview } from '@/hooks/useBillReview';
import { buildReviewPayload, formFromInvoice } from '@/lib/wallet/billReview';
import type { InvoiceReviewPayload } from '@/models/wallet';
import { kostaInvoice } from './fixtures/billReview';

/**
 * H2 end to end on the phone's side: the real hook, service and API client, against a fake server (a
 * stubbed `fetch`; nothing leaves the process). The server bumps the version on every save, as the
 * API's `@Version` does, and either honours `Idempotency-Key` (the fixed API) or ignores it (the API
 * as first reviewed).
 */

jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/contexts/OutletProvider', () => ({ useOutlet: () => ({ outlet: { id: 7 } }) }));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canForOutlet: () => true }) }));

const envelope = (data: unknown, status = 200, error: { code: string; message: string } | null = null) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: () => null },
  text: async () => JSON.stringify({ data, error, meta: {} }),
}) as unknown as Response;

/** What the server keeps and answers: numbers as JSON numbers (other scales than were sent). */
function stored(body: InvoiceReviewPayload) {
  const num = (v: string | null) => (v == null ? null : Number(v));
  return {
    ...body,
    items: body.items.map((i) => ({
      ...i,
      sku: i.sku && { ...i.sku, unitPrice: num(i.sku.unitPrice) },
      quantity: num(i.quantity), amount: num(i.amount), tax: num(i.tax) ?? 0, fromInvoice: null,
    })),
    delivery: num(body.delivery) ?? 0,
    deliveryOverridden: false,
    subtotal: 0, tax: 0, total: 0, reviewedAt: '2026-10-03T04:00:00Z',
  };
}

function fakeServer({ honoursKey, loseFirstAnswer }: { honoursKey: boolean; loseFirstAnswer: boolean }) {
  const base = kostaInvoice();
  const state = { version: 3, review: null as unknown, commits: 0, puts: [] as { key: string; body: string }[] };
  const answered = new Map<string, unknown>();
  const invoice = () => ({ ...base, version: state.version, review: state.review });
  const fetchMock = jest.fn(async (url: string, init: RequestInit) => {
    const method = init.method ?? 'GET';
    if (method === 'GET') return envelope(invoice());
    const key = (init.headers as Record<string, string>)['Idempotency-Key'] ?? '';
    const text = String(init.body);
    state.puts.push({ key, body: text });
    if (honoursKey && answered.has(key)) return envelope(answered.get(key));
    const body = JSON.parse(text) as InvoiceReviewPayload;
    if (body.version !== state.version) {
      return envelope(null, 409, { code: 'INVOICE_CHANGED', message: 'This bill was changed since you opened it. Reload it and try again.' });
    }
    state.version += 1;
    state.commits += 1;
    state.review = stored(body);
    answered.set(key, invoice());
    if (loseFirstAnswer && state.commits === 1) throw new TypeError('Network request failed');
    return envelope(invoice());
  });
  return { state, fetchMock, someoneElseSaves: (body: InvoiceReviewPayload) => { state.version += 1; state.review = stored(body); } };
}

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useSaveInvoiceReview('184'), { wrapper });
}

async function save(result: { current: ReturnType<typeof useSaveInvoiceReview> }, body: InvoiceReviewPayload) {
  let caught: unknown;
  let value: unknown;
  await act(async () => {
    const pending = result.current.mutateAsync(body).then((v) => { value = v; }, (e) => { caught = e; });
    await jest.advanceTimersByTimeAsync(SAVE_RETRY_DELAY_MS + 50);
    await pending;
  });
  return { value, caught };
}

const form = formFromInvoice(kostaInvoice())!;
const mine = buildReviewPayload({ ...form, invoiceNumber: '1631A', dateConfirmed: true }, 3);

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('saving a review over a flaky network (H2)', () => {
  it('lost answer, then the repeat: a server that honours the key answers 200, and the review is saved once', async () => {
    const server = fakeServer({ honoursKey: true, loseFirstAnswer: true });
    global.fetch = server.fetchMock as unknown as typeof fetch;
    const { result } = setup();
    const { value, caught } = await save(result, mine);
    expect(caught).toBeUndefined();
    expect((value as { version: number }).version).toBe(4);
    expect(server.state.commits).toBe(1);
    expect(server.state.puts).toHaveLength(2);
    expect(server.state.puts[1]).toEqual(server.state.puts[0]); // same key, same body
  });

  it('lost answer, then the repeat on a server that ignores the key: its 409 is seen to be our own save, so success', async () => {
    const server = fakeServer({ honoursKey: false, loseFirstAnswer: true });
    global.fetch = server.fetchMock as unknown as typeof fetch;
    const { result } = setup();
    const { value, caught } = await save(result, mine);
    expect(caught).toBeUndefined();
    expect((value as { version: number }).version).toBe(4);
    expect(server.state.commits).toBe(1);
    expect(server.fetchMock.mock.calls.map((c) => (c[1] as RequestInit).method ?? 'GET')).toEqual(['PUT', 'PUT', 'GET']);
  });

  it('two devices: the other device saved something else first, so this save gets the 409 for the screen', async () => {
    const server = fakeServer({ honoursKey: true, loseFirstAnswer: false });
    global.fetch = server.fetchMock as unknown as typeof fetch;
    server.someoneElseSaves(buildReviewPayload({ ...form, invoiceNumber: 'OTHER' }, 3));
    const { result } = setup();
    const { caught } = await save(result, mine);
    expect(caught).toMatchObject({ status: 409, code: 'INVOICE_CHANGED' });
    expect(server.state.commits).toBe(0);
  });

  it('a 5xx is not repeated by the client layer (retries: 0) nor by the hook', async () => {
    const fetchMock = jest.fn(async () => envelope(null, 503, { code: 'UNAVAILABLE', message: 'x' }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { result } = setup();
    const { caught } = await save(result, mine);
    expect(caught).toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
