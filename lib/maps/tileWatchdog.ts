import { useCallback, useEffect, useState } from 'react';

/**
 * Detects "the map never drew tiles" (on Android an authorization failure has no JS callback).
 *
 * <p>The real MapView must report `onMapLoaded` within `timeoutMs` of mounting. If it does not, that map swaps to
 * the schematic. The session is marked failed (every later map goes straight to the schematic) only by a definitive
 * failure: Google refusing the key (`auth`), or a timeout while no map this session has ever drawn tiles. Once any
 * map has drawn tiles the key and the SDK are known to work, so a later timeout is that map's own problem (a map on
 * a hidden screen draws nothing and must never condemn the visible ones).
 */
export const TILE_TIMEOUT_MS = 6000;

export type TileFailure = 'timeout' | 'auth';

let sessionFailed = false;
let anyLoaded = false;
let warned = false;

/** True once the session is known to have no working map (see `markTilesFailed`). */
export function tilesFailed(): boolean {
  return sessionFailed;
}

/** A map drew its tiles: the key and the SDK work for this session. */
export function markTilesLoaded(): void {
  anyLoaded = true;
}

/**
 * Marks the whole session failed. A `timeout` is ignored once any map has drawn tiles; `auth` (the key was refused)
 * always counts. Returns whether the session is now failed.
 */
export function markTilesFailed(reason: TileFailure = 'timeout'): boolean {
  if (reason === 'timeout' && anyLoaded) return sessionFailed;
  sessionFailed = true;
  if (!warned) {
    warned = true;
    console.warn('[maps] tiles did not load; check the Android key restriction and Maps SDK');
  }
  return true;
}

/** Test seam: forget the session's failure and loads. */
export function resetTileWatchdog(): void {
  sessionFailed = false;
  anyLoaded = false;
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
      markTilesFailed('timeout');
      setFailed(true);
    }, timeoutMs);
    return () => clearTimeout(timer);
  }, [enabled, loaded, failed, timeoutMs]);

  const onLoaded = useCallback(() => {
    markTilesLoaded();
    setLoaded(true);
  }, []);
  return { failed: enabled && (failed || sessionFailed), onLoaded };
}
