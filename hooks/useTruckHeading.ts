import { useEffect, useRef, useState } from 'react';
import type { DeliveryLocation } from '@/models/delivery';
import { advanceHeading, shortestTurn, turnLerp, type HeadingState } from '@/lib/delivery/mapGeometry';

/** How long the native marker takes to turn to a new heading, and its frame step. */
export const TURN_MS = 600;
const TURN_STEP_MS = 40;

const fixKey = (d: DeliveryLocation) => `${d.latitude},${d.longitude},${d.bearing ?? ''}`;

/**
 * Where the truck faces, in degrees clockwise from north: the provider's bearing when it sends one, else the
 * direction of the last move of 5 m or more (see `advanceHeading`). Standing still (at the pickup, in traffic) keeps
 * the last heading. Before any move it faces north.
 */
export function useTruckHeading(driver: DeliveryLocation | null | undefined): number {
  const [state, setState] = useState<{ key: string; s: HeadingState }>({ key: '', s: { anchor: null, heading: 0 } });
  if (driver) {
    const key = fixKey(driver);
    if (key !== state.key) {
      // React's "adjust state while rendering" pattern: the heading follows the fix in the same render.
      const next = { key, s: advanceHeading(state.s, driver) };
      setState(next);
      return next.s.heading;
    }
  }
  return state.s.heading;
}

/** `target`, eased in over TURN_MS the short way round (350 to 10 passes north). The first value is shown at once. */
export function useSmoothHeading(target: number, ms: number = TURN_MS): number {
  const [shown, setShown] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    const from = current.current;
    if (shortestTurn(from, target) === 0) return undefined;
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const step = () => {
      const t = Math.min(1, (Date.now() - started) / ms);
      current.current = t < 1 ? turnLerp(from, target, t) : target;
      setShown(current.current);
      timer = t < 1 ? setTimeout(step, TURN_STEP_MS) : null;
    };
    timer = setTimeout(step, TURN_STEP_MS);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [target, ms]);
  return shown;
}
