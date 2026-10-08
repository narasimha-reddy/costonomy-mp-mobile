import React from 'react';
import { act, render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RealtimeProvider } from '@/contexts/RealtimeProvider';
import { fetchRealtimeEvents, fetchRealtimeTicket } from '@/services/notifications';

let mockSession: { accessToken: string | null; authenticated: boolean } = { accessToken: 'A', authenticated: true };
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => mockSession }));
jest.mock('@/services/notifications', () => ({ fetchRealtimeEvents: jest.fn(), fetchRealtimeTicket: jest.fn() }));

class FakeSocket {
  static OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((m: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  close = jest.fn();
  constructor(public url: string) { FakeSocket.instances.push(this); }
}

const ticketFor = (t: string) => ({ ticket: `T-${t}`, url: 'ws://x/socket', cursor: 1 });
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const tokensRequested = () => (fetchRealtimeTicket as jest.Mock).mock.calls.map((c) => c[0]);

describe('RealtimeProvider connection', () => {
  let client: QueryClient;
  let invalidate: jest.SpyInstance;
  const original = (global as { WebSocket?: unknown }).WebSocket;
  beforeEach(() => {
    jest.useFakeTimers();
    mockSession = { accessToken: 'A', authenticated: true };
    FakeSocket.instances = [];
    (global as { WebSocket?: unknown }).WebSocket = FakeSocket;
    client = new QueryClient();
    invalidate = jest.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
    (fetchRealtimeTicket as jest.Mock).mockReset();
    (fetchRealtimeEvents as jest.Mock).mockReset().mockResolvedValue({ events: [], cursor: null, hasMore: false });
  });
  afterEach(() => {
    jest.useRealTimers();
    (global as { WebSocket?: unknown }).WebSocket = original;
  });

  const tree = () => (
    <QueryClientProvider client={client}><RealtimeProvider><></></RealtimeProvider></QueryClientProvider>
  );
  const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
  const advance = (ms: number) => act(async () => { jest.advanceTimersByTime(ms); });

  it('a token change while ticket A is in flight requests a ticket with token B once A fails', async () => {
    const a = deferred<ReturnType<typeof ticketFor>>();
    (fetchRealtimeTicket as jest.Mock).mockImplementation((t: string) =>
      (t === 'A' ? a.promise : Promise.reject(new Error('B stops here'))));
    const view = render(tree());
    await flush();
    expect(tokensRequested()).toEqual(['A']);

    mockSession = { accessToken: 'B', authenticated: true };
    view.rerender(tree());
    await flush();
    a.reject(new Error('401'));
    await flush();
    await advance(60_000);

    expect(tokensRequested()).toContain('B');
    // The stale chain must not keep posting with the old token.
    const afterB = tokensRequested().slice(tokensRequested().indexOf('B'));
    expect(afterB.filter((t) => t === 'A')).toHaveLength(0);
  });

  it('a ticket that resolves for a replaced token never opens a socket', async () => {
    const a = deferred<ReturnType<typeof ticketFor>>();
    (fetchRealtimeTicket as jest.Mock).mockImplementation((t: string) =>
      (t === 'A' ? a.promise : new Promise(() => {})));
    const view = render(tree());
    await flush();
    mockSession = { accessToken: 'B', authenticated: true };
    view.rerender(tree());
    await flush();
    a.resolve(ticketFor('A'));
    await flush();
    expect(FakeSocket.instances).toHaveLength(0);
  });

  it('the old socket close cannot reach the new socket: handlers are detached before it closes', async () => {
    (fetchRealtimeTicket as jest.Mock).mockImplementation((t: string) => Promise.resolve(ticketFor(t)));
    const view = render(tree());
    await flush();
    const first = FakeSocket.instances[0]!;
    expect(first).toBeDefined();
    mockSession = { accessToken: 'B', authenticated: true };
    view.rerender(tree());
    await flush();
    expect(first.close).toHaveBeenCalled();
    expect(first.onclose).toBeNull();
    expect(first.onmessage).toBeNull();
    const second = FakeSocket.instances[1];
    expect(second).toBeDefined();
    // Even if a late close event were delivered, no reconnect may start while the second socket is live.
    const before = (fetchRealtimeTicket as jest.Mock).mock.calls.length;
    first.onclose?.();
    await advance(5_000);
    expect((fetchRealtimeTicket as jest.Mock).mock.calls.length).toBe(before);
  });

  it('a failing ticket after unmount schedules nothing', async () => {
    const a = deferred<ReturnType<typeof ticketFor>>();
    (fetchRealtimeTicket as jest.Mock).mockReturnValue(a.promise);
    const view = render(tree());
    await flush();
    view.unmount();
    const timeouts = jest.spyOn(global, 'setTimeout');
    a.reject(new Error('late'));
    await flush();
    // No reconnect timer (1 s and up) is scheduled for a provider that is gone.
    expect(timeouts.mock.calls.filter((c) => (c[1] ?? 0) >= 1_000)).toHaveLength(0);
    timeouts.mockRestore();
    await advance(120_000);
    expect(fetchRealtimeTicket).toHaveBeenCalledTimes(1);
  });

  it('a handshake that closes without opening backs off 1 s then 2 s', async () => {
    (fetchRealtimeTicket as jest.Mock).mockImplementation((t: string) => Promise.resolve(ticketFor(t)));
    render(tree());
    await flush();
    expect(fetchRealtimeTicket).toHaveBeenCalledTimes(1);
    FakeSocket.instances[0]!.onclose?.();
    await advance(999);
    expect(fetchRealtimeTicket).toHaveBeenCalledTimes(1);
    await advance(1);
    await flush();
    expect(fetchRealtimeTicket).toHaveBeenCalledTimes(2);
    FakeSocket.instances[1]!.onclose?.();
    await advance(1_999);
    expect(fetchRealtimeTicket).toHaveBeenCalledTimes(2);
    await advance(1);
    await flush();
    expect(fetchRealtimeTicket).toHaveBeenCalledTimes(3);
  });

  it('signing out clears the retry timer', async () => {
    (fetchRealtimeTicket as jest.Mock).mockRejectedValue(new Error('403'));
    const view = render(tree());
    await flush();
    expect(fetchRealtimeTicket).toHaveBeenCalledTimes(1);
    mockSession = { accessToken: null, authenticated: false };
    view.rerender(tree());
    await flush();
    await advance(120_000);
    expect(fetchRealtimeTicket).toHaveBeenCalledTimes(1);
  });

  const openWithEvent = async () => {
    (fetchRealtimeTicket as jest.Mock).mockImplementation((t: string) => Promise.resolve(ticketFor(t)));
    const view = render(tree());
    await flush();
    const socket = FakeSocket.instances[0]!;
    act(() => {
      socket.onmessage?.({ data: JSON.stringify({
        cursor: 9, channel: 'c', eventType: 'x', aggregateType: 'SUPPLIER_ORDER', aggregateId: 3, payload: null, occurredAt: '',
      }) });
    });
    return view;
  };

  it('unmounting cancels the pending invalidation batch', async () => {
    const view = await openWithEvent();
    view.unmount();
    await advance(1_000);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('signing out cancels the pending invalidation batch', async () => {
    const view = await openWithEvent();
    mockSession = { accessToken: null, authenticated: false };
    view.rerender(tree());
    await advance(1_000);
    expect(invalidate).not.toHaveBeenCalled();
  });
});
