import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSendReminder } from '@/hooks/useSendReminder';
import { ApiError, NetworkError } from '@/lib/api/errors';
import { sendReminder } from '@/services/credit';

jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/StoreProvider', () => ({ useStore: () => ({ storeId: 5 }) }));
jest.mock('@/services/credit', () => ({ ...jest.requireActual('@/services/credit'), sendReminder: jest.fn() }));
const sendM = sendReminder as jest.Mock;
const err = (code: string, status: number, details?: Record<string, unknown>) =>
  new ApiError({ code, status, message: 'server', details });

function setup() {
  const client = new QueryClient();
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { ...renderHook(() => useSendReminder(3), { wrapper }), invalidate };
}
const keyOf = (i: number) => sendM.mock.calls[i][3];

describe('useSendReminder', () => {
  beforeEach(() => { jest.clearAllMocks(); sendM.mockReset(); sendM.mockResolvedValue({ id: 1 }); });

  it('keeps one key across a dropped connection and a 5xx', async () => {
    sendM.mockRejectedValueOnce(new NetworkError()).mockRejectedValueOnce(err('X', 503)).mockResolvedValue({ id: 1 });
    const { result } = setup();
    for (let i = 0; i < 3; i += 1) await act(async () => { await result.current.send({ note: 'hi' }); });
    expect(keyOf(1)).toBe(keyOf(0));
    expect(keyOf(2)).toBe(keyOf(0));
  });

  it('a 429 throttle spends the key: the next attempt is new', async () => {
    sendM.mockRejectedValueOnce(err('CREDIT_REMINDER_TOO_SOON', 429, { nextAllowedAt: '2026-10-07T10:00:00Z' })).mockResolvedValue({ id: 1 });
    const { result } = setup();
    await act(async () => { await result.current.send({}); });
    expect(result.current.error).toBe('You can remind again at 3:30 pm on 7th Oct.');
    await act(async () => { await result.current.send({}); });
    expect(keyOf(1)).not.toBe(keyOf(0));
  });

  it('key reuse says the first may have been sent and refreshes', async () => {
    sendM.mockRejectedValueOnce(err('IDEMPOTENCY_KEY_REUSE', 409));
    const { result, invalidate } = setup();
    await act(async () => { await result.current.send({}); });
    expect(result.current.error).toMatch(/may have been sent/i);
    expect(invalidate).toHaveBeenCalled();
  });

  it('the invoice order does not change the attempt', async () => {
    sendM.mockRejectedValueOnce(new NetworkError()).mockResolvedValue({ id: 1 });
    const { result } = setup();
    await act(async () => { await result.current.send({ invoiceIds: [2, 1] }); });
    await act(async () => { await result.current.send({ invoiceIds: [1, 2] }); });
    expect(keyOf(1)).toBe(keyOf(0));
  });
});
