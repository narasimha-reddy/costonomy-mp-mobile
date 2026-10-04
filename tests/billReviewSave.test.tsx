import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SAVE_RETRY_DELAY_MS, SAVE_TIMEOUT_MS, useSaveInvoiceReview } from '@/hooks/useBillReview';
import { ApiError, NetworkError, RequestTimeoutError } from '@/lib/api/errors';
import { buildReviewPayload, formFromInvoice } from '@/lib/wallet/billReview';
import { walletInvoiceKey, walletTransactionKey } from '@/lib/queryKeys';
import { fetchWalletInvoice, saveWalletInvoiceReview } from '@/services/wallet';
import { kostaDraft, kostaInvoice } from './fixtures/billReview';

jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/contexts/OutletProvider', () => ({ useOutlet: () => ({ outlet: { id: 7 } }) }));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canForOutlet: () => true }) }));
jest.mock('@/services/wallet', () => ({
  saveWalletInvoiceReview: jest.fn(), fetchWalletInvoice: jest.fn(), fetchSkuLookup: jest.fn(), fetchSupplierLookup: jest.fn(),
}));

const payload = buildReviewPayload(formFromInvoice(kostaInvoice())!, 3);
const changed = () => new ApiError({ code: 'INVOICE_CHANGED', message: 'This bill was changed since you opened it.', status: 409 });

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(() => useSaveInvoiceReview('184'), { wrapper }) };
}

const save = saveWalletInvoiceReview as jest.Mock;
const keyOf = (call: number) => save.mock.calls[call][4].idempotencyKey;

beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.useRealTimers());

async function run(result: { current: ReturnType<typeof useSaveInvoiceReview> }, body = payload) {
  let caught: unknown;
  let value: unknown;
  await act(async () => {
    const pending = result.current.mutateAsync(body).then((v) => { value = v; }, (e) => { caught = e; });
    await jest.advanceTimersByTimeAsync(SAVE_RETRY_DELAY_MS + 1);
    await pending;
  });
  return { value, caught };
}

describe('saving a review (hook)', () => {
  beforeEach(() => jest.useFakeTimers());

  it('a lost answer is sent once more, identical, with the same key, and that answer is the save', async () => {
    save.mockRejectedValueOnce(new NetworkError()).mockResolvedValueOnce(kostaInvoice({ version: 4 }));
    const { result } = setup();
    const { value } = await run(result);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][2]).toEqual(save.mock.calls[0][2]);
    expect(keyOf(1)).toBe(keyOf(0));
    expect((value as { version: number }).version).toBe(4);
  });

  it('repeats only once: a second lost answer is the screen’s to show (and Try again reuses the key)', async () => {
    save.mockRejectedValueOnce(new NetworkError()).mockRejectedValueOnce(new NetworkError()).mockResolvedValueOnce(kostaInvoice());
    const { result } = setup();
    const { caught } = await run(result);
    expect(caught).toBeInstanceOf(NetworkError);
    expect(save).toHaveBeenCalledTimes(2);
    await run(result);
    expect(save).toHaveBeenCalledTimes(3);
    expect(keyOf(2)).toBe(keyOf(0));
  });

  it('never repeats an answer the server gave (5xx, 400, 409)', async () => {
    for (const error of [
      new ApiError({ code: 'X', message: 'x', status: 503 }),
      new ApiError({ code: 'VALIDATION_ERROR', message: 'x', status: 400 }),
      new ApiError({ code: 'INVOICE_STILL_READING', message: 'x', status: 409 }),
    ]) {
      save.mockReset().mockRejectedValueOnce(error);
      const { result } = setup();
      const { caught } = await run(result);
      expect(caught).toBe(error);
      expect(save).toHaveBeenCalledTimes(1);
    }
  });

  it('a refusal (400, or 422 IDEMPOTENCY_KEY_REUSED) drops the key, so the next try is a new attempt', async () => {
    save
      .mockRejectedValueOnce(new ApiError({ code: 'VALIDATION_ERROR', message: 'x', status: 400 }))
      .mockRejectedValueOnce(new ApiError({ code: 'IDEMPOTENCY_KEY_REUSED', message: 'x', status: 422 }))
      .mockResolvedValueOnce(kostaInvoice());
    const { result } = setup();
    await run(result);
    await run(result);
    await run(result);
    expect(keyOf(1)).not.toBe(keyOf(0));
    expect(keyOf(2)).not.toBe(keyOf(1));
  });

  it('different edits get a new key', async () => {
    save.mockResolvedValue(kostaInvoice());
    save.mockRejectedValueOnce(new NetworkError()).mockRejectedValueOnce(new NetworkError());
    const { result } = setup();
    await run(result);
    await run(result, { ...payload, invoiceNumber: '1632' });
    expect(keyOf(2)).not.toBe(keyOf(0));
  });

  it('409 INVOICE_CHANGED after a lost answer: the bill holds exactly what was sent, so it is a success', async () => {
    const asSaved = kostaInvoice({
      version: 4,
      review: kostaDraft({ invoiceDate: '2026-09-01', delivery: '0.0', reviewedAt: '2026-10-03T04:00:00Z' }),
    });
    save.mockRejectedValueOnce(new NetworkError()).mockRejectedValueOnce(changed());
    (fetchWalletInvoice as jest.Mock).mockResolvedValueOnce(asSaved);
    const { result, client } = setup();
    const { value, caught } = await run(result);
    expect(caught).toBeUndefined();
    expect(value).toBe(asSaved);
    expect(fetchWalletInvoice).toHaveBeenCalledWith(7, '184', 'token');
    expect(client.getQueryData(walletInvoiceKey(7, '184'))).toBe(asSaved);
  });

  it('409 INVOICE_CHANGED from another device (the bill holds something else): passed on to the screen', async () => {
    save.mockRejectedValueOnce(changed());
    (fetchWalletInvoice as jest.Mock).mockResolvedValueOnce(kostaInvoice({
      version: 5, review: kostaDraft({ invoiceNumber: '7777', reviewedAt: '2026-10-03T05:00:00Z' }),
    }));
    const { result } = setup();
    const { caught } = await run(result);
    expect(caught).toMatchObject({ status: 409, code: 'INVOICE_CHANGED' });
  });

  it('409 INVOICE_CHANGED and the bill cannot be fetched: still the 409', async () => {
    save.mockRejectedValueOnce(changed());
    (fetchWalletInvoice as jest.Mock).mockRejectedValueOnce(new NetworkError());
    const { result } = setup();
    const { caught } = await run(result);
    expect(caught).toMatchObject({ code: 'INVOICE_CHANGED' });
  });

  it('puts the saved bill (with the server’s totals) in the cache and refreshes the details page', async () => {
    const saved = kostaInvoice({ version: 4, review: { ...kostaDraft(), reviewedAt: '2026-10-03T04:00:00Z' } });
    save.mockResolvedValueOnce(saved);
    const { result, client } = setup();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    await run(result);
    expect(client.getQueryData(walletInvoiceKey(7, '184'))).toBe(saved);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: walletTransactionKey(7, '184') });
  });

  it('an attempt with no answer in time is given up as a timeout and repeated once, with the same key', async () => {
    save.mockImplementation((_o, _e, _p, _t, opts: { signal: AbortSignal }) =>
      new Promise((_, reject) => {
        opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      }));
    const { result } = setup();
    let caught: unknown;
    await act(async () => {
      const pending = result.current.mutateAsync(payload).catch((e) => { caught = e; });
      await jest.advanceTimersByTimeAsync(SAVE_TIMEOUT_MS * 2 + SAVE_RETRY_DELAY_MS + 10);
      await pending;
    });
    expect(caught).toBeInstanceOf(RequestTimeoutError);
    expect(save).toHaveBeenCalledTimes(2);
    expect(keyOf(1)).toBe(keyOf(0));
  });
});
