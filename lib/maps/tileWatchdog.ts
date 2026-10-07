import { useCallback, useEffect, useState } from 'react';

/**
 * Detects "the Android map never drew tiles" (an authorization failure has no JS callback).
 *
 * <p>The real MapView must report `onMapLoaded` within `timeoutMs` of mounting. If it does not, the
 * session is marked failed, so every later map goes straight to the schematic, and the caller swaps to it.
 */
export const TILE_TIMEOUT_MS = 6000;

let sessionFailed = false;
let warned = false;

/** True once any map this session failed to load tiles. */
export function tilesFailed(): boolean {
  return sessionFailed;
}

export function markTilesFailed(): void {
  sessionFailed = true;
  if (!warned) {
    warned = true;
    console.warn('[maps] tiles did not load; check the Android key restriction and Maps SDK');
  }
}

/** Test seam: forget the session's failure. */
export function resetTileWatchdog(): void {
  sessionFailed = false;
  warned = false;
}

/**
 * `enabled` is false when there is nothing to watch (iOS, no key, forced sketch).
 * `failed` turns true after `timeoutMs` without `onLoaded()`, or at once if an earlier map failed.
 */
export function useTileWatchdog(
  timeoutMs: number = TILE_TIMEOUT_MS,
  enabled: boolean = true,
): { failed: boolean; onLoaded: () => void } {
  const [failed, setFailed] = useState(enabled && sessionFailed);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled || loaded || failed) return undefined;
    const timer = setTimeout(() => {
      markTilesFailed();
      setFailed(true);
    }, timeoutMs);
    return () => clearTimeout(timer);
  }, [enabled, loaded, failed, timeoutMs]);

  const onLoaded = useCallback(() => setLoaded(true), []);
  return { failed: enabled && (failed || sessionFailed), onLoaded };
}
