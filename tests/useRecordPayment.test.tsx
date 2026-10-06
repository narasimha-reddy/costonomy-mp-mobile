import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRecordPayment } from '@/hooks/useRecordPayment';
import { recordSupplierPayment } from '@/services/credit';

jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/StoreProvider', () => ({ useStore: () => ({ storeId: 5 }) }));
jest.mock('@/services/credit', () => ({
  ...jest.requireActual('@/services/credit'),
  recordSupplierPayment: jest.fn(),
}));
const recordM = recordSupplierPayment as jest.Mock;

const body = { amount: '2500.00', method: 'UPI' as const, reference: 'UTR12345', paidOn: '2026-10-06' };
const RECEIPT = { receiptId: 1, amount: '2500.0000', method: 'UPI', reference: 'UTR12345', paidOn: '2026-10-06', allocations: [], agreement: { due: '0', overdue: '0', available: '0', status: 'ACTIVE' } };

function setup() {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useRecordPayment(3), { wrapper });
}

describe('useRecordPayment', () => {
  beforeEach(() => { jest.clearAllMocks(); recordM.mockResolvedValue(RECEIPT); });

  it('reaches the server once when called twice in the same instant, whatever the buttons do', async () => {
    let finish!: (v: unknown) => void;
    recordM.mockReturnValue(new Promise((res) => { finish = res; }));
    const { result } = setup();
    let first: Promise<unknown>; let second: Promise<unknown>;
    act(() => { first = result.current.record(body); second = result.current.record(body); });
    expect(recordM).toHaveBeenCalledTimes(1);
    await act(async () => { finish(RECEIPT); await first; });
    expect(await second!).toBeNull();
  });

  it('the same body twice in a row (after an unknown outcome) uses one key, a changed amount another', async () => {
    recordM.mockRejectedValueOnce(new Error('network down')).mockResolvedValue(RECEIPT);
    const { result } = setup();
    await act(async () => { await result.current.record(body); });
    await act(async () => { await result.current.record(body); });
    expect(recordM.mock.calls[1][3]).toBe(recordM.mock.calls[0][3]);
    await act(async () => { await result.current.record({ ...body, amount: '10.00' }); });
    expect(recordM.mock.calls[2][3]).not.toBe(recordM.mock.calls[0][3]);
  });
});
