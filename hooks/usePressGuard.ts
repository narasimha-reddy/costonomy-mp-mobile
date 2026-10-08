import { useLayoutEffect, useRef } from 'react';
import { createPressGuard, PRESS_WINDOW_MS, type PressGuard } from '@/lib/orders/pressGuard';

/**
 * A press guard that restarts its window whenever `stage` changes (not when the first stage arrives, so the first press on
 * a freshly opened screen is never swallowed). The restart runs in a layout effect, before the frame that shows the next
 * stage's button is painted, so a tap cannot land on that button ahead of the window starting.
 */
export function usePressGuard(stage: string | null | undefined, windowMs: number = PRESS_WINDOW_MS): PressGuard {
  const guard = useRef<PressGuard | undefined>(undefined);
  if (guard.current == null) guard.current = createPressGuard(windowMs);
  const previous = useRef(stage);
  useLayoutEffect(() => {
    if (previous.current !== stage) {
      // The order loading (no stage yet, then its first one) is not a stage change.
      const loaded = previous.current != null;
      previous.current = stage;
      if (loaded) guard.current?.stageChanged();
    }
  }, [stage]);
  return guard.current;
}
