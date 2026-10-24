import { useEffect, useState } from 'react';
import { serverNow } from '@/lib/server-clock';

const TICK_MS = 30_000;

/**
 * The server-corrected time in ms, refreshed every 30 seconds so an ETA that has passed is noticed without the
 * screen having to refetch. Minute precision is all an ETA needs.
 */
export function useServerNow(tickMs: number = TICK_MS): number {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);
  return now;
}
