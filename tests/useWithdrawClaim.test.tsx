import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useWithdrawClaim } from '@/hooks/useWithdrawClaim';
import { ApiError } from '@/lib/api/errors';
import { withdrawClaim } from '@/services/credit';

jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/OutletProvider', () => ({ useOutlet: () => ({ outletId: 7 }) }));
const mockToast = jest.fn();
jest.mock('@/components/common', () => ({ useToast: () => ({ show: mockToast }) }));
jest.mock('@/services/credit', () => ({
  ...jest.requireActual('@/services/credit'),
  withdrawClaim: jest.fn(),
}));

const withdrawM = withdrawClaim as jest.Mock;
const clients: QueryClient[] = [];
afterEach(() => { clients.splice(0).forEach((c) => c.clear()); });

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { invalidate, ...renderHook(() => useWithdrawClaim(3), { wrapper }) };
}

beforeEach(() => jest.clearAllMocks());

describe('useWithdrawClaim', () => {
  it('withdraws, refreshes and says so once the server answered', async () => {
    withdrawM.mockResolvedValue({ id: 5, status: 'WITHDRAWN' });
    const { result, invalidate } = setup();
    let done = false;
    await act(async () => { done = await result.current.withdraw(5); });
    expect(done).toBe(true);
    expect(withdrawM).toHaveBeenCalledWith('tok', 5);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['outlet', 7, 'credit'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['credit-agreement', 3] });
    expect(mockToast).toHaveBeenCalledWith('Report withdrawn', 'success');
  });

  it('refreshes and explains when the supplier answered first', async () => {
    withdrawM.mockRejectedValue(new ApiError({ code: 'CREDIT_CLAIM_STATE', message: 'x', status: 409 }));
    const { result, invalidate } = setup();
    let done = true;
    await act(async () => { done = await result.current.withdraw(5); });
    expect(done).toBe(false);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['outlet', 7, 'credit'] });
    expect(mockToast).toHaveBeenCalledWith('Your supplier already answered this report.', 'error');
  });

  it('shows a plain error on any other failure and refreshes nothing', async () => {
    withdrawM.mockRejectedValue(new Error('boom'));
    const { result, invalidate } = setup();
    await act(async () => { await result.current.withdraw(5); });
    expect(invalidate).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith("Couldn't withdraw that. Please try again.", 'error');
  });
});
