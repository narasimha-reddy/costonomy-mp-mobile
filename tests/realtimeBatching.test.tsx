import React from 'react';
import { act, render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RealtimeProvider, invalidationKeys } from '@/contexts/RealtimeProvider';
import { fetchRealtimeEvents, fetchRealtimeTicket } from '@/services/notifications';

jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok', authenticated: true }) }));
jest.mock('@/services/notifications', () => ({ fetchRealtimeEvents: jest.fn(), fetchRealtimeTicket: jest.fn() }));

const ev = (cursor: number, aggregateType: string, aggregateId: number | null = 5) =>
  ({ cursor, channel: 'c', eventType: 'x', aggregateType, aggregateId, payload: null, occurredAt: '' });

describe('realtime invalidation keys for the supplier', () => {
  it('INTENT event invalidates supplier-store and the single request', () => {
    const keys = invalidationKeys(ev(1, 'INTENT', 7));
    expect(keys).toContainEqual(['supplier-store']);
    expect(keys).toContainEqual(['intent', 7]);
  });

  it('SUPPLIER_ORDER invalidates outlet and supplier-store and the order', () => {
    const keys = invalidationKeys(ev(1, 'SUPPLIER_ORDER', 9));
    expect(keys).toContainEqual(['outlet']);
    expect(keys).toContainEqual(['supplier-store']);
    expect(keys).toContainEqual(['supplier-order', 9]);
  });

  it('DELIVERY invalidates supplier-store and outlet', () => {
    const keys = invalidationKeys(ev(1, 'DELIVERY'));
    expect(keys).toContainEqual(['supplier-store']);
    expect(keys).toContainEqual(['outlet']);
  });
});

describe('RealtimeProvider batching', () => {
  let client: QueryClient;
  let spy: jest.SpyInstance;
  beforeEach(() => {
    jest.useFakeTimers();
    client = new QueryClient();
    spy = jest.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
    (fetchRealtimeTicket as jest.Mock).mockReset().mockReturnValue(new Promise(() => {})); // stays pending
    (fetchRealtimeEvents as jest.Mock).mockReset();
  });
  afterEach(() => { jest.useRealTimers(); });

  const mount = () => render(
    <QueryClientProvider client={client}><RealtimeProvider><></></RealtimeProvider></QueryClientProvider>,
  );

  it('burst of 5 events invalidates each key once', async () => {
    (fetchRealtimeEvents as jest.Mock).mockResolvedValue({
      events: [1, 2, 3, 4, 5].map((c) => ev(c, 'SUPPLIER_ORDER', 9)), cursor: 5, hasMore: false,
    });
    mount();
    await act(async () => { jest.advanceTimersByTime(15_000); });
    await act(async () => { jest.advanceTimersByTime(500); });
    const keys = spy.mock.calls.map((c) => JSON.stringify(c[0].queryKey));
    expect(keys.length).toBeGreaterThan(0);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.filter((k) => k === JSON.stringify(['outlet']))).toHaveLength(1);
  });

  it('no ticket request while one is pending', async () => {
    mount();
    await act(async () => { jest.advanceTimersByTime(60_000); });
    expect(fetchRealtimeTicket).toHaveBeenCalledTimes(1);
  });

  it('a failing ticket backs off 1 s, 2 s, 4 s instead of hammering', async () => {
    (fetchRealtimeTicket as jest.Mock).mockReset().mockRejectedValue(new Error('403'));
    mount();
    await act(async () => { await Promise.resolve(); });
    expect(fetchRealtimeTicket).toHaveBeenCalledTimes(1);
    await act(async () => { jest.advanceTimersByTime(1_000); });
    expect(fetchRealtimeTicket).toHaveBeenCalledTimes(2);
    await act(async () => { jest.advanceTimersByTime(1_000); });
    expect(fetchRealtimeTicket).toHaveBeenCalledTimes(2);
    await act(async () => { jest.advanceTimersByTime(1_000); });
    expect(fetchRealtimeTicket).toHaveBeenCalledTimes(3);
  });
});
