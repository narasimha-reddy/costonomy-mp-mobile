import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDecideClaim } from '@/hooks/useDecideClaim';
import { resetAttemptKeys } from '@/lib/credit/attemptKeys';
import { confirmClaim, rejectClaim } from '@/services/credit';

jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/StoreProvider', () => ({ useStore: () => ({ storeId: 5 }) }));
jest.mock('@/services/credit', () => ({
  ...jest.requireActual('@/services/credit'),
  confirmClaim: jest.fn(),
  rejectClaim: jest.fn(),
}));

const confirmM = confirmClaim as jest.Mock;
const rejectM = rejectClaim as jest.Mock;
const CLAIM = { id: 1 } as never;

function setup() {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useDecideClaim(), { wrapper });
}

beforeEach(() => { jest.clearAllMocks(); resetAttemptKeys(); });

describe('useDecideClaim', () => {
  it('sends one request when called twice before the first answers (confirm)', async () => {
    let done!: (v: unknown) => void;
    confirmM.mockReturnValue(new Promise((r) => { done = r; }));
    const { result } = setup();
    let a: Promise<unknown>; let b: Promise<unknown>;
    act(() => { a = result.current.confirm(CLAIM, null); b = result.current.confirm(CLAIM, null); });
    expect(confirmM).toHaveBeenCalledTimes(1);
    await act(async () => { done({ id: 1 }); await a; expect(await b).toBeNull(); });
  });

  it('sends one request when called twice before the first answers (reject)', async () => {
    let done!: (v: unknown) => void;
    rejectM.mockReturnValue(new Promise((r) => { done = r; }));
    const { result } = setup();
    act(() => { void result.current.reject(CLAIM, 'Not received'); void result.current.reject(CLAIM, 'Not received'); });
    expect(rejectM).toHaveBeenCalledTimes(1);
    await act(async () => { done({ id: 1 }); });
  });

  it('reuses the key for the same amount and uses a new one for a different amount', async () => {
    confirmM.mockRejectedValue(new Error('network'));
    const { result } = setup();
    await act(async () => { await result.current.confirm(CLAIM, null); });
    await act(async () => { await result.current.confirm(CLAIM, null); });
    await act(async () => { await result.current.confirm(CLAIM, '3000.00'); });
    const keys = confirmM.mock.calls.map((c) => c[2]);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
  });
});
