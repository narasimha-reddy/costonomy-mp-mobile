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

    const invalidate = (key: unknown[]) => void queryClient.invalidateQueries({ queryKey: key });

    switch (event.aggregateType) {
      case 'SUPPLIER_ORDER':
        if (event.aggregateId != null) invalidate(['supplier-order', event.aggregateId]);
        invalidate(['outlet']);
        invalidate(['store']);
        break;
      case 'DELIVERY':
        invalidate(['supplier-order']);
        break;
      case 'PROCUREMENT':
        if (event.aggregateId != null) invalidate(['procurement', event.aggregateId]);
        invalidate(['outlet']);
        break;
      case 'CREDIT_AGREEMENT':
        if (event.aggregateId != null) invalidate(['credit-agreement', event.aggregateId]);
        invalidate(['outlet']);
        invalidate(['store']);
        break;
      case 'PAYMENT':
        invalidate(['supplier-order']);
        invalidate(['procurement']);
        break;
      default:
        break;
    }

    // Every event can produce a notification, and the badge is server-backed.
    invalidate(['notifications']);
  }, [queryClient]);

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
    if (accessToken == null || stoppedRef.current) return;

    try {
      const ticket = await fetchRealtimeTicket(accessToken);
      if (cursorRef.current == null && ticket.cursor != null) {
        cursorRef.current = ticket.cursor;
        setCursor(ticket.cursor);
      }

      const socket = new WebSocket(socketUrl(ticket.url, ticket.ticket));
      socketRef.current = socket;

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
        setTransport('polling');
        const delay = Math.min(
          RECONNECT_MAX_MS,
          RECONNECT_BASE_MS * 2 ** attemptRef.current,
        );
        attemptRef.current += 1;
        setTimeout(() => void connect(), delay);
      };
    } catch {
      // No ticket — an expired session, or the server is unreachable. Polling
      // carries on regardless, which is the point of having it.
      setTransport('polling');
      const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** attemptRef.current);
      attemptRef.current += 1;
      setTimeout(() => void connect(), delay);
    }
  }, [accessToken, apply, drain]);

  // Connect while signed in; tear down on sign-out.
  useEffect(() => {
    if (!authenticated || accessToken == null) {
      stoppedRef.current = true;
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
