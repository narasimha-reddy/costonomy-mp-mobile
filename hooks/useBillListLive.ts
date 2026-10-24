import { useEffect, useRef, useState } from 'react';
import { useIsFocused } from 'expo-router';

/** How often a list is asked again while one of its bills is being read. */
export const LIST_POLL_MS = 3000;
/** After this long with a bill still READING the list stops asking (the details page says "still reading"). */
export const LIST_POLL_LIMIT_MS = 90_000;

/** The refetch interval for a list: only while a bill is READING, the screen is focused and the window is open. */
export function listPollInterval(
  reading: boolean, focused: boolean, startedAt: number | null, now: number,
): number | false {
  if (!reading || !focused) return false;
  if (startedAt != null && now - startedAt >= LIST_POLL_LIMIT_MS) return false;
  return LIST_POLL_MS;
}

/**
 * Keep a list that shows bill chips fresh while a bill is being read.
 *
 * <p>Pass the result as the query's `refetchInterval` (the query still pauses in the background).
 * The 90 s window starts when `reading` turns true and resets when it turns false. When the screen
 * regains focus (not on first mount) the list is refetched once straight away.
 */
export function useBillListLive(reading: boolean, refetch: () => unknown): number | false {
  const focused = useIsFocused();
  const startedAt = useRef<number | null>(null);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!reading) {
      startedAt.current = null;
      setExpired(false);
      return undefined;
    }
    if (startedAt.current == null) startedAt.current = Date.now();
    const left = Math.max(0, LIST_POLL_LIMIT_MS - (Date.now() - startedAt.current));
    const timer = setTimeout(() => setExpired(true), left);
    return () => clearTimeout(timer);
  }, [reading]);

  const wasFocused = useRef(focused);
  const latest = useRef(refetch);
  latest.current = refetch;
  useEffect(() => {
    if (focused && !wasFocused.current) void latest.current();
    wasFocused.current = focused;
  }, [focused]);

  return reading && !expired ? listPollInterval(reading, focused, startedAt.current, Date.now()) : false;
}
