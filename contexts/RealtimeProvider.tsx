import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { fetchRealtimeEvents, fetchRealtimeTicket } from '@/services/notifications';
import type { RealtimeEvent } from '@/models/notification';
import { API_BASE_URL } from '@/lib/api/config';

const POLL_MS = 15_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

type Transport = 'connecting' | 'socket' | 'polling' | 'offline';

interface RealtimeState {
  /** Which transport is actually carrying events right now. */
  transport: Transport;
  /** The newest cursor seen, on any transport. */
  cursor: number | null;
}

/**
 * Which cached queries an event makes stale.
 *
 * <p>Requests live under ['outlet', id, 'intents'] and orders under ['outlet', id, 'orders'], so ['outlet'] covers the
 * Home pill for an answered request and for an order in flight. A delivery moves its order's status too, so it
 * refreshes the outlet lists as well.
 */
export function invalidationKeys(event: RealtimeEvent): unknown[][] {
  const keys: unknown[][] = [];
  switch (event.aggregateType) {
    case 'SUPPLIER_ORDER':
      if (event.aggregateId != null) keys.push(['supplier-order', event.aggregateId]);
      keys.push(['outlet'], ['store'], ['supplier-store'], ['supplier-orders']);
      break;
    case 'DELIVERY':
      keys.push(
        ['supplier-order'], ['deliveries'], ['outlet-delivery-radar'], ['outlet-deliveries'], ['outlet'],
        ['supplier-store'], ['supplier-orders'],
      );
      break;
    case 'INTENT':
      // ['supplier-store'] covers the supplier's request carousel and list; ['intent', id] the single request.
      if (event.aggregateId != null) keys.push(['intent', event.aggregateId]);
      keys.push(['outlet'], ['store'], ['supplier-store']);
      break;
    case 'PROCUREMENT':
      if (event.aggregateId != null) keys.push(['procurement', event.aggregateId]);
      keys.push(['outlet']);
      break;
    case 'CREDIT_AGREEMENT':
      if (event.aggregateId != null) keys.push(['credit-agreement', event.aggregateId]);
      keys.push(['outlet'], ['store']);
      break;
    case 'PAYMENT':
      keys.push(['supplier-order'], ['procurement']);
      break;
    default:
      break;
  }
  // Every event can produce a notification, and the badge is server-backed.
  keys.push(['notifications']);
  return keys;
}

/** Drop repeated keys, keeping first-seen order. */
export function dedupeKeys(keys: unknown[][]): unknown[][] {
  const seen = new Set<string>();
  return keys.filter((key) => {
    const id = JSON.stringify(key);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

const BATCH_MS = 75;

/**
 * Collects the keys of every event in one burst (a drain page, a socket flurry) and invalidates each distinct key
 * once, after a short window. Without it one event fired the same eight GETs four times over.
 */
export function createInvalidationBatcher(invalidate: (key: unknown[]) => void, windowMs: number = BATCH_MS) {
  let pending: unknown[][] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    if (timer != null) clearTimeout(timer);
    timer = null;
    const keys = dedupeKeys(pending);
    pending = [];
    keys.forEach(invalidate);
  };
  return {
    add(keys: unknown[][]) {
      pending.push(...keys);
      if (timer == null) timer = setTimeout(flush, windowMs);
    },
    flush,
    cancel() {
      if (timer != null) clearTimeout(timer);
      timer = null;
      pending = [];
    },
  };
}

const RealtimeContext = createContext<RealtimeState>({ transport: 'connecting', cursor: null });

/**
 * Live updates. Doc 06 §9, doc 05 §16.
 *
 * <p><b>An event is a prompt to refresh, never the record.</b> Nothing here writes
 * a payload into a screen's cache — it invalidates the queries the event affects
 * and lets each screen re-read its own authoritative endpoint. A socket frame is
 * the one piece of state in the system that arrives without an access check at
 * read time, and treating it as data is how a stale or mis-scoped payload ends up
 * rendered as fact.
 *
 * <p><b>Polling is the floor, not the failure case.</b> §16 lists socket, push,
 * then polling, and the polling loop keeps running whenever the socket is not
 * connected — including the seconds after a token expiry, a backgrounded app, or
 * a dropped connection. Both transports carry the same shape and advance the same
 * cursor, so a gap on one is filled by the other rather than lost.
 *
 * <p>The cursor always moves forward. Resuming from the newest event seen means a
 * reconnect replays what was missed and nothing else — §16's "on reconnect/cold
 * start, refresh authoritative state".
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { accessToken, authenticated } = useSession();

  const [transport, setTransport] = useState<Transport>('connecting');
  const cursorRef = useRef<number | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const stoppedRef = useRef(false);
  /** True from the ticket POST until the socket is built or the attempt failed: never two tickets at once. */
  const connectingRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const batcher = useMemo(
    () => createInvalidationBatcher((key) => void queryClient.invalidateQueries({ queryKey: key })),
    [queryClient],
  );
  useEffect(() => () => batcher.cancel(), [batcher]);

  /**
   * React to an event by invalidating what it touches.
   *
   * <p>Deliberately coarse: an order event invalidates that order and the lists
   * it can appear on. Being clever about which list would mean encoding, on the
   * client, rules about which screen shows which status — the thing the server
   * already decides.
   */
  const apply = useCallback((event: RealtimeEvent) => {
    if (event.cursor > (cursorRef.current ?? 0)) {
      cursorRef.current = event.cursor;
      setCursor(event.cursor);
    }

    batcher.add(invalidationKeys(event));
  }, [batcher]);

  /** Catch up over REST. Also the whole transport when the socket is down. */
  const drain = useCallback(async () => {
    if (accessToken == null) return;
    try {
      let more = true;
      let guard = 0;
      while (more && guard < 10) {
        const page = await fetchRealtimeEvents(accessToken, cursorRef.current);
        page.events.forEach(apply);
        if (page.cursor != null && page.cursor > (cursorRef.current ?? 0)) {
          cursorRef.current = page.cursor;
          setCursor(page.cursor);
        }
        more = page.hasMore;
        guard += 1;
      }
    } catch {
      // A failed poll is not a state change. The next tick tries again.
    }
  }, [accessToken, apply]);

  const connect = useCallback(async () => {
    if (accessToken == null || stoppedRef.current || connectingRef.current) return;
    if (socketRef.current != null) return;
    connectingRef.current = true;

    const retry = () => {
      setTransport('polling');
      const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** attemptRef.current);
      attemptRef.current += 1;
      if (retryTimerRef.current != null) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = setTimeout(() => void connect(), delay);
    };

    try {
      const ticket = await fetchRealtimeTicket(accessToken);
      if (stoppedRef.current) {
        connectingRef.current = false;
        return;
      }
      if (cursorRef.current == null && ticket.cursor != null) {
        cursorRef.current = ticket.cursor;
        setCursor(ticket.cursor);
      }

      const socket = new WebSocket(socketUrl(ticket.url, ticket.ticket));
      socketRef.current = socket;
      connectingRef.current = false;

      socket.onopen = () => {
        attemptRef.current = 0;
        setTransport('socket');
        // §16: refresh authoritative state on connect. Anything that happened
        // while we were away arrives over REST, on the same cursor.
        void drain();
      };

      socket.onmessage = (message) => {
        try {
          const parsed = JSON.parse(String(message.data)) as
            Partial<RealtimeEvent> & { type?: string; cursor?: number };

          // The server opens with a `ready` frame carrying the resume cursor, and
          // answers pings with `pong`. Neither is an event: `ready` has a cursor
          // but no aggregate, and running it through `apply` would advance the
          // cursor past events the socket has not delivered yet — losing exactly
          // what the drain below exists to collect.
          if (parsed?.type === 'ready') {
            if (parsed.cursor != null && cursorRef.current == null) {
              cursorRef.current = parsed.cursor;
              setCursor(parsed.cursor);
            }
            return;
          }
          if (parsed?.type != null) return;

          if (parsed?.cursor != null && parsed.aggregateType != null) {
            apply(parsed as RealtimeEvent);
          }
        } catch {
          // A frame we cannot parse is a frame we ignore. The cursor has not
          // moved, so the next drain fetches whatever it was.
        }
      };

      socket.onerror = () => {
        // onclose always follows; reconnecting is handled there.
      };

      socket.onclose = () => {
        socketRef.current = null;
        if (stoppedRef.current) return;
        // A handshake that never opened (403, wrong origin) backs off like a failed ticket.
        retry();
      };
    } catch {
      connectingRef.current = false;
      // No ticket — an expired session, or the server is unreachable. Polling
      // carries on regardless, which is the point of having it.
      retry();
    }
  }, [accessToken, apply, drain]);

  // Connect while signed in; tear down on sign-out.
  useEffect(() => {
    if (!authenticated || accessToken == null) {
      stoppedRef.current = true;
      if (retryTimerRef.current != null) clearTimeout(retryTimerRef.current);
      socketRef.current?.close();
      socketRef.current = null;
      setTransport('offline');
      return undefined;
    }

    stoppedRef.current = false;
    attemptRef.current = 0;
    setTransport('connecting');
    void connect();

    return () => {
      stoppedRef.current = true;
      if (retryTimerRef.current != null) clearTimeout(retryTimerRef.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [authenticated, accessToken, connect]);

  // The floor. Runs whether or not the socket is up — cheap, and it closes the
  // window where a socket looks connected but is silently dead.
  useEffect(() => {
    if (!authenticated) return undefined;
    const timer = setInterval(() => {
      if (socketRef.current?.readyState !== WebSocket.OPEN) void drain();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [authenticated, drain]);

  // Coming back from the background is a cold start for this purpose.
  useEffect(() => {
    if (!authenticated) return undefined;
    const onChange = (state: AppStateStatus) => {
      if (state === 'active') void drain();
    };
    const subscription = AppState.addEventListener('change', onChange);
    return () => subscription.remove();
  }, [authenticated, drain]);

  const value = useMemo<RealtimeState>(() => ({ transport, cursor }), [transport, cursor]);

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeState {
  return useContext(RealtimeContext);
}

/**
 * Where to connect.
 *
 * <p>The server returns a path **relative to the API's context**, not to the
 * origin — `/api/v1/realtime/socket`, where the API itself lives under
 * `/costonomy-mp-api`. Resolving that with `new URL(path, base)` would treat the
 * leading slash as origin-absolute and drop the context path, producing a URL
 * that never connects. The app would then fall back to polling forever and look
 * perfectly healthy while doing it, which is why this is concatenation and not
 * URL resolution.
 *
 * <p>An absolute `ws://` or `wss://` url from the server is used as given, so the
 * socket can move to its own host without a client change.
 */
export function socketUrl(url: string, ticket: string, base: string = API_BASE_URL): string {
  const absolute = /^wss?:\/\//i.test(url)
    ? url
    : `${base.replace(/\/$/, '')}${url.startsWith('/') ? url : `/${url}`}`
      .replace(/^http/i, 'ws');
  return `${absolute}${absolute.includes('?') ? '&' : '?'}ticket=${encodeURIComponent(ticket)}`;
}
