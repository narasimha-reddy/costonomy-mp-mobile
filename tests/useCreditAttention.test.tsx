import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCreditAttention } from '@/hooks/useCreditAttention';
import { fetchCreditAttention } from '@/services/credit';

jest.mock('@/services/credit', () => ({ fetchCreditAttention: jest.fn() }));
let mockOutletId: number | null = 7;
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/OutletProvider', () => ({ useOutlet: () => ({ outletId: mockOutletId }) }));

const fetchMock = fetchCreditAttention as jest.Mock;

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 1 } } });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

beforeEach(() => { fetchMock.mockReset(); mockOutletId = 7; });

describe('useCreditAttention', () => {
  it('returns the flags from the server', async () => {
    fetchMock.mockResolvedValue({ overdue: true, dueSoon: false, amount: 999 });
    const { result } = renderHook(() => useCreditAttention(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.overdue).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith('tok', 7);
    // Only the two flags, never an amount.
    expect(Object.keys(result.current).sort()).toEqual(['dueSoon', 'overdue']);
  });

  it('shows nothing when the request fails, after one retry', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useCreditAttention(), { wrapper: wrapper() });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(result.current).toEqual({ overdue: false, dueSoon: false });
  });

  it('does not ask without an outlet', () => {
    mockOutletId = null;
    const { result } = renderHook(() => useCreditAttention(), { wrapper: wrapper() });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current).toEqual({ overdue: false, dueSoon: false });
  });
});
