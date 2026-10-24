import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  refreshBillViews, useBillWaiver, useDeleteWalletInvoice, useUploadWalletInvoice, useWalletInvoice,
} from '@/hooks/useWalletInvoice';
import { useWalletTransaction } from '@/hooks/useWalletTransaction';
import { useSaveInvoiceReview } from '@/hooks/useBillReview';
import {
  walletInvoiceKey, walletKey, walletTransactionKey, walletTransactionsKey, walletTransactionsRootKey,
} from '@/lib/queryKeys';
import {
  deleteWalletInvoice, fetchWalletInvoice, fetchWalletTransaction, saveWalletInvoiceReview, undoWalletBillWaiver,
  uploadWalletInvoice, waiveWalletBill,
} from '@/services/wallet';

jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/contexts/OutletProvider', () => ({ useOutlet: () => ({ outlet: { id: 7 } }) }));
jest.mock('@/services/wallet', () => ({
  waiveWalletBill: jest.fn(), undoWalletBillWaiver: jest.fn(),
  deleteWalletInvoice: jest.fn(), fetchWalletInvoice: jest.fn(), uploadWalletInvoice: jest.fn(),
  fetchWalletTransaction: jest.fn(), saveWalletInvoiceReview: jest.fn(),
}));

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
}

/** Puts one cached query under each key, and returns whether each is now stale. */
function seed(client: QueryClient) {
  const keys = {
    detail: walletTransactionKey(7, 184),
    list: walletTransactionsKey(7, { bills: [] }),
    options: walletTransactionsKey(7, 'filter-options'),
    otherDetail: walletTransactionKey(7, 999),
    otherOutlet: walletTransactionsKey(8, { bills: [] }),
    wallet: walletKey(7),
    invoice: walletInvoiceKey(7, 184),
    otherWallet: walletKey(8),
  };
  for (const key of Object.values(keys)) client.setQueryData(key, { ok: true });
  const stale = () => Object.fromEntries(
    Object.entries(keys).map(([name, key]) => [name, client.getQueryState(key)?.isInvalidated === true]));
  return stale;
}

describe('walletTransactionsRootKey', () => {
  it('is the prefix of every list key and the list key is built on it', () => {
    expect(walletTransactionsRootKey(7)).toEqual(['outlet', 7, 'wallet', 'transactions']);
    expect(walletTransactionsKey(7, 'x')).toEqual([...walletTransactionsRootKey(7), 'x']);
    expect(walletTransactionsKey(7)).toEqual(['outlet', 7, 'wallet', 'transactions', null]);
  });
});

describe('refreshBillViews', () => {
  it('invalidates the entry detail and every history list of the outlet, and nothing else', async () => {
    const client = newClient();
    const stale = seed(client);
    await refreshBillViews(client, 7, 184);
    expect(stale()).toEqual({
      detail: true, list: true, options: true, otherDetail: false, otherOutlet: false,
      wallet: true, invoice: false, otherWallet: false,
    });
  });
});

describe('useBillWaiver', () => {
  function wrap(client: QueryClient) {
    return function Wrapper({ children }: { children: React.ReactNode }) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    };
  }

  it('waives and undoes through the service, then refreshes both views', async () => {
    const client = newClient();
    const stale = seed(client);
    (waiveWalletBill as jest.Mock).mockResolvedValue(undefined);
    (undoWalletBillWaiver as jest.Mock).mockResolvedValue(undefined);
    const { result } = renderHook(() => useBillWaiver('184'), { wrapper: wrap(client) });

    await act(async () => { await result.current.waive.mutateAsync(); });
    expect(waiveWalletBill).toHaveBeenCalledWith(7, '184', 'token');
    expect(stale()).toMatchObject({ detail: true, list: true, wallet: true });

    seed(client);
    await act(async () => { await result.current.undo.mutateAsync(); });
    expect(undoWalletBillWaiver).toHaveBeenCalledWith(7, '184', 'token');
    expect(stale()).toMatchObject({ detail: true, list: true, wallet: true });
  });

  it('refreshes nothing when the server refuses', async () => {
    const client = newClient();
    const stale = seed(client);
    (waiveWalletBill as jest.Mock).mockRejectedValue(new Error('nope'));
    const { result } = renderHook(() => useBillWaiver('184'), { wrapper: wrap(client) });
    await act(async () => { await result.current.waive.mutateAsync().catch(() => undefined); });
    expect(stale()).toMatchObject({ detail: false, list: false });
  });
});

function wrap(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('every bill change reaches History, Recent and the details', () => {
  const reached = { detail: true, list: true, options: true, wallet: true, otherDetail: false, otherOutlet: false, otherWallet: false };

  it('upload', async () => {
    const client = newClient();
    const stale = seed(client);
    (uploadWalletInvoice as jest.Mock).mockResolvedValue({ status: 'READING' });
    const { result } = renderHook(() => useUploadWalletInvoice('184'), { wrapper: wrap(client) });
    await act(async () => { await result.current.mutateAsync({ files: [] }); });
    expect(stale()).toMatchObject(reached);
  });

  it('delete', async () => {
    const client = newClient();
    const stale = seed(client);
    (deleteWalletInvoice as jest.Mock).mockResolvedValue(undefined);
    const { result } = renderHook(() => useDeleteWalletInvoice('184'), { wrapper: wrap(client) });
    await act(async () => { await result.current.mutateAsync(); });
    expect(stale()).toMatchObject(reached);
  });

  it('review save', async () => {
    const client = newClient();
    const stale = seed(client);
    (saveWalletInvoiceReview as jest.Mock).mockResolvedValue({ status: 'READ' });
    const { result } = renderHook(() => useSaveInvoiceReview('184'), { wrapper: wrap(client) });
    await act(async () => { await result.current.mutateAsync({} as never); });
    expect(stale()).toMatchObject(reached);
  });
});

describe('a bill that leaves READING while watched refreshes the lists', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => { cleanup.splice(0).forEach((f) => f()); });
  const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

  it('the invoice poll', async () => {
    const client = newClient();
    (fetchWalletInvoice as jest.Mock).mockResolvedValue({ status: 'READING' });
    const hook = renderHook(() => useWalletInvoice('555'), { wrapper: wrap(client) });
    cleanup.push(() => { hook.unmount(); client.clear(); });
    await waitFor(() => expect(client.getQueryData(walletInvoiceKey(7, '555'))).toBeTruthy());
    await flush();
    const stale = seed(client);
    expect(stale().list).toBe(false);
    await act(async () => { client.setQueryData(walletInvoiceKey(7, '555'), { status: 'READ' }); });
    await waitFor(() => expect(stale().list).toBe(true));
    expect(stale()).toMatchObject({ list: true, wallet: true, otherOutlet: false, otherWallet: false });
  });

  it('the details poll', async () => {
    const client = newClient();
    (fetchWalletTransaction as jest.Mock).mockResolvedValue({ invoice: { status: 'READING' } });
    const hook = renderHook(() => useWalletTransaction('555'), { wrapper: wrap(client) });
    cleanup.push(() => { hook.unmount(); client.clear(); });
    await waitFor(() => expect(client.getQueryData(walletTransactionKey(7, '555'))).toBeTruthy());
    await flush();
    const stale = seed(client);
    await act(async () => { client.setQueryData(walletTransactionKey(7, '555'), { invoice: { status: 'READ' } }); });
    await waitFor(() => expect(stale().list).toBe(true));
    expect(stale()).toMatchObject({ list: true, wallet: true, otherOutlet: false, otherWallet: false });
  });

  it('does not refresh when the bill was never READING', async () => {
    const client = newClient();
    (fetchWalletInvoice as jest.Mock).mockResolvedValue({ status: 'READ' });
    const hook = renderHook(() => useWalletInvoice('555'), { wrapper: wrap(client) });
    cleanup.push(() => { hook.unmount(); client.clear(); });
    await waitFor(() => expect(client.getQueryData(walletInvoiceKey(7, '555'))).toBeTruthy());
    await flush();
    const stale = seed(client);
    await act(async () => { client.setQueryData(walletInvoiceKey(7, '555'), { status: 'UNREADABLE' }); });
    await act(async () => { await new Promise((r) => { setTimeout(r, 30); }); });
    expect(stale()).toMatchObject({ list: false, wallet: false });
  });
});
