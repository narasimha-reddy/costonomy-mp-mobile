/**
 * A cooldown for the supplier order screen's sticky stage bar.
 *
 * <p>The bar shows one button per stage, and the next stage's button renders in the same spot a moment after the
 * first press lands. A double tap on "Start preparing" therefore pressed "Mark ready" as well: the packing stage was
 * skipped and a rider booked early. A press counts only when the window since the last accepted press, or since the
 * stage last changed, has passed.
 */
export interface PressGuard {
  /** Runs `action` unless a press or a stage change happened within the window. */
  press: (action: () => void) => void;
  /** The stage changed (the refetch landed): the window starts again from now. */
  stageChanged: () => void;
}

export const PRESS_WINDOW_MS = 800;

export function createPressGuard(windowMs: number = PRESS_WINDOW_MS, now: () => number = Date.now): PressGuard {
  let last: number | null = null;
  return {
    press(action) {
      const at = now();
      if (last != null && at - last < windowMs) return;
      last = at;
      action();
    },
    stageChanged() {
      last = now();
    },
  };
}
