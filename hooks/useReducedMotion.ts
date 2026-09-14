import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * The system "Reduce Motion" setting, kept live.
 *
 * PRD §23A.49 requires every animation to respect it. A component that animates
 * should read this and fall back to an instant state change, not a shorter one —
 * a fast animation is still motion.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let active = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReduced(value);
      })
      .catch(() => {
        // Setting unavailable on this platform — assume motion is fine.
      });

    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  return reduced;
}
