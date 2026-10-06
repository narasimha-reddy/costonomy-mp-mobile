import { useCallback, useEffect, useRef } from 'react';

/** How long a second tap on the same destination is ignored. */
export const NAVIGATION_LOCK_MS = 700;

/**
 * A guard against double navigation: a quick second tap on a row must not push
 * the same screen twice (two copies stacked, and Back lands on the first).
 *
 * <p>`go(destination, fn)` runs `fn` unless `fn` was run for the same
 * `destination` in the last {@link NAVIGATION_LOCK_MS}. Different destinations
 * are independent.
 */
export function useSingleNavigation() {
  const locked = useRef(new Set<string>());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => { pending.forEach(clearTimeout); };
  }, []);

  return useCallback((destination: string, navigate: () => void) => {
    if (locked.current.has(destination)) return;
    locked.current.add(destination);
    const timer = setTimeout(() => {
      locked.current.delete(destination);
      timers.current.delete(timer);
    }, NAVIGATION_LOCK_MS);
    timers.current.add(timer);
    navigate();
  }, []);
}
