import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useReversePayment } from '@/hooks/useReversePayment';
import { ApiError, NetworkError } from '@/lib/api/errors';
import { reversePayment, reverseReceipt } from '@/services/credit';

jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/StoreProvider', () => ({ useStore: () => ({ storeId: 5 }) }));
jest.mock('@/services/credit', () => ({
  ...jest.requireActual('@/services/credit'),
  reverseReceipt: jest.fn(),
  reversePayment: jest.fn(),
}));
const receiptM = reverseReceipt as jest.Mock;
const paymentM = reversePayment as jest.Mock;

const RESULT = { receiptId: 9, paymentId: null, amount: '2500.0000', reason: 'Wrong restaurant', reversedAt: '2026-10-06T10:00:00Z', allocations: [], agreement: { due: '0', overdue: '0', available: '0', status: 'ACTIVE' } };
const err = (code: string, status: number, details?: Record<string, unknown>, message = 'server') =>
  new ApiError({ code, status, message, details });

function setup() {
  const client = new QueryClient();
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { ...renderHook(() => useReversePayment(3), { wrapper }), invalidate };
}

describe('useReversePayment', () => {
  beforeEach(() => { jest.clearAllMocks(); receiptM.mockResolvedValue(RESULT); paymentM.mockResolvedValue(RESULT); });

  it('uses the receipt endpoint when the payment has a receipt, else the payment endpoint', async () => {
    const { result } = setup();
    await act(async () => { await result.current.reverse({ receiptId: 9, paymentId: 31 }, 'Wrong restaurant'); });
    expect(receiptM).toHaveBeenCalledWith('tok', 9, 'Wrong restaurant', expect.any(String));
    expect(paymentM).not.toHaveBeenCalled();
    await act(async () => { await result.current.reverse({ receiptId: null, paymentId: 31 }, 'Wrong restaurant'); });
    expect(paymentM).toHaveBeenCalledWith('tok', 31, 'Wrong restaurant', expect.any(String));
  });

  it('refreshes receivables, line, invoices, payments, statement and claims after success', async () => {
    const { result, invalidate } = setup();
    await act(async () => { await result.current.reverse({ receiptId: 9, paymentId: 31 }, 'Wrong restaurant'); });
    const keys = invalidate.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys).toEqual(expect.arrayContaining([
      JSON.stringify(['store', 5, 'credit']),
      JSON.stringify(['store', 5, 'credit-claims']),
      JSON.stringify(['store', 5, 'credit-payments']),
      JSON.stringify(['credit-invoice']),
    ]));
    expect(keys.some((k) => k.includes('credit-agreement') || k.includes('"3"') || k.includes(',3'))).toBe(true);
  });

  it('reaches the server once when called twice in the same instant', async () => {
    let finish!: (v: unknown) => void;
    receiptM.mockReturnValue(new Promise((res) => { finish = res; }));
    const { result } = setup();
    let first: Promise<unknown>; let second: Promise<unknown>;
    act(() => {
      first = result.current.reverse({ receiptId: 9, paymentId: 31 }, 'Wrong restaurant');
      second = result.current.reverse({ receiptId: 9, paymentId: 31 }, 'Wrong restaurant');
    });
    expect(receiptM).toHaveBeenCalledTimes(1);
    await act(async () => { finish(RESULT); await first; });
    expect(await second!).toBeNull();
  });

  it('keeps the same key after a dropped connection', async () => {
    receiptM.mockRejectedValueOnce(new NetworkError()).mockResolvedValue(RESULT);
    const { result } = setup();
    await act(async () => { await result.current.reverse({ receiptId: 9, paymentId: 31 }, 'Wrong restaurant'); });
    expect(result.current.error).toMatch(/try again/i);
    await act(async () => { await result.current.reverse({ receiptId: 9, paymentId: 31 }, 'Wrong restaurant'); });
    expect(receiptM.mock.calls[1][3]).toBe(receiptM.mock.calls[0][3]);
  });

  it('keeps the same key after a 5xx', async () => {
    receiptM.mockRejectedValueOnce(err('INTERNAL', 503)).mockResolvedValue(RESULT);
    const { result } = setup();
    await act(async () => { await result.current.reverse({ receiptId: 9, paymentId: 31 }, 'Wrong restaurant'); });
    await act(async () => { await result.current.reverse({ receiptId: 9, paymentId: 31 }, 'Wrong restaurant'); });
    expect(receiptM.mock.calls[1][3]).toBe(receiptM.mock.calls[0][3]);
  });

  it.each([
    ['CREDIT_REVERSAL_NOT_ALLOWED', 409, undefined, /can't be undone/i],
    ['CREDIT_REVERSAL_WINDOW_CLOSED', 409, { closedOn: '2026-10-13', reversibleUntil: '2026-10-12' }, /too late.*12th Oct/i],
    ['CREDIT_ALREADY_REVERSED', 409, undefined, /already cancelled/i],
    ['CREDIT_REVERSAL_NO_HEADROOM', 422, { needed: 5000, available: 3000, shortBy: 2000 }, /Raise their limit by ₹2,000\.00 first, or suspend the line\./],
    ['VALIDATION_FAILED', 400, undefined, /server/],
  ])('after %s the next attempt gets a fresh key and the words are plain', async (code, status, details, words) => {
    receiptM.mockRejectedValueOnce(err(code, status as number, details as Record<string, unknown> | undefined)).mockResolvedValue(RESULT);
    const { result } = setup();
    await act(async () => { await result.current.reverse({ receiptId: 9, paymentId: 31 }, 'Wrong restaurant'); });
    expect(result.current.error).toMatch(words as RegExp);
    expect(result.current.error).not.toMatch(/CREDIT_/);
    await act(async () => { await result.current.reverse({ receiptId: 9, paymentId: 31 }, 'Wrong restaurant'); });
    expect(receiptM.mock.calls[1][3]).not.toBe(receiptM.mock.calls[0][3]);
  });

  it('IDEMPOTENCY_KEY_REUSE says the earlier try may have worked and refreshes', async () => {
    receiptM.mockRejectedValueOnce(err('IDEMPOTENCY_KEY_REUSE', 409));
    const { result, invalidate } = setup();
    await act(async () => { await result.current.reverse({ receiptId: 9, paymentId: 31 }, 'Wrong restaurant'); });
    expect(result.current.error).toMatch(/may have gone through/i);
    expect(invalidate).toHaveBeenCalled();
  });

  it('a different reason is a different attempt with its own key', async () => {
    receiptM.mockRejectedValueOnce(new NetworkError()).mockResolvedValue(RESULT);
    const { result } = setup();
    await act(async () => { await result.current.reverse({ receiptId: 9, paymentId: 31 }, 'Wrong restaurant'); });
    await act(async () => { await result.current.reverse({ receiptId: 9, paymentId: 31 }, 'Typed the wrong amount'); });
    expect(receiptM.mock.calls[1][3]).not.toBe(receiptM.mock.calls[0][3]);
  });
});
