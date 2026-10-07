import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCreditStatement } from '@/hooks/useCreditStatement';
import { fetchCreditStatement } from '@/services/credit';

jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/OutletProvider', () => ({ useOutlet: () => ({ outletId: 7 }) }));
jest.mock('@/services/credit', () => ({ fetchCreditStatement: jest.fn() }));

const fetchM = fetchCreditStatement as jest.Mock;
const clients: QueryClient[] = [];
afterEach(() => { clients.splice(0).forEach((c) => c.clear()); });

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => { jest.clearAllMocks(); fetchM.mockResolvedValue({ agreementId: 3, lines: [] }); });

describe('useCreditStatement', () => {
  it('asks the service with an empty range when none is chosen, so the server picks the days', async () => {
    const { result } = renderHook(() => useCreditStatement(3, null), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchM).toHaveBeenCalledWith('tok', 3, {});
  });

  it('passes a chosen range through', async () => {
    const range = { from: '2026-09-01', to: '2026-09-30' };
    const { result } = renderHook(() => useCreditStatement(3, range), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchM).toHaveBeenCalledWith('tok', 3, range);
  });
});
