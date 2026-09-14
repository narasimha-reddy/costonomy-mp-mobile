import { Colors } from './colors';

/**
 * Motion and time-based thresholds.
 *
 * PRD §23A.49: motion communicates state, it does not decorate. Every duration
 * an animation can use is named here, and every animation must be skippable —
 * see `useReducedMotion()` in hooks/useReducedMotion.ts, which returns the
 * system "Reduce Motion" setting. A component that animates without consulting
 * it is a §23A.48 accessibility defect.
 */
export const Duration = {
  /** Press feedback, chip toggle, checkbox. */
  instant: 100,
  /** Skeleton-to-content crossfade, toast in/out. */
  fast: 180,
  /** Bottom sheet present/dismiss, screen transition. */
  normal: 250,
  /** Order-status timeline advance — slow enough to be noticed as a change. */
  slow: 400,
} as const;

export const Easing = {
  /** Entering the screen. */
  decelerate: [0.0, 0.0, 0.2, 1.0] as const,
  /** Leaving the screen. */
  accelerate: [0.4, 0.0, 1.0, 1.0] as const,
  /** Moving within the screen. */
  standard: [0.4, 0.0, 0.2, 1.0] as const,
} as const;

/**
 * Supplier response countdown (PRD §11, §13, §23A.34).
 *
 * The SLA itself is **server-owned and configurable** — 60s is only the default,
 * and the authoritative value reaches the client as `responseDeadlineAt` on the
 * order. Nothing here may be used to compute a deadline. These are presentation
 * thresholds only: how the remaining time, whatever it is, should look.
 *
 * Thresholds are fractions of the order's own SLA window rather than fixed
 * seconds, so they stay meaningful if a store is configured to 30s or 300s.
 */
export const Countdown = {
  /** Above this fraction of the window remaining → calm. */
  warnBelowFraction: 0.5,
  /** Below this fraction remaining → critical. */
  criticalBelowFraction: 0.2,
  /** Never let "critical" start later than this many seconds out. */
  criticalFloorSeconds: 10,
  /** How often the countdown re-renders. */
  tickMs: 1000,
} as const;

export type CountdownLevel = 'calm' | 'warn' | 'critical' | 'expired';

/**
 * Classify a countdown for display.
 *
 * Both arguments come from the server: `remainingSeconds` is derived from the
 * order's `responseDeadlineAt` against a server-synced clock, and `windowSeconds`
 * is that order's configured SLA. Never pass a device-clock value (§13: "Countdown
 * is based on server deadline, not device clock").
 */
export function countdownLevel(
  remainingSeconds: number,
  windowSeconds: number,
): CountdownLevel {
  if (remainingSeconds <= 0) return 'expired';
  if (windowSeconds <= 0) return 'critical';

  const fraction = remainingSeconds / windowSeconds;
  const criticalAt = Math.max(
    Countdown.criticalFloorSeconds,
    windowSeconds * Countdown.criticalBelowFraction,
  );

  if (remainingSeconds <= criticalAt) return 'critical';
  if (fraction <= Countdown.warnBelowFraction) return 'warn';
  return 'calm';
}

export const CountdownPalette: Record<
  CountdownLevel,
  { fg: string; bg: string }
> = {
  calm: { fg: Colors.countdownCalm, bg: Colors.countdownCalmBg },
  warn: { fg: Colors.countdownWarn, bg: Colors.countdownWarnBg },
  critical: { fg: Colors.countdownCritical, bg: Colors.countdownCriticalBg },
  expired: { fg: Colors.textTertiary, bg: Colors.surfaceSunken },
};

/**
 * Data freshness (PRD §23A.46 "Stale", §15 "Never fake driver movement",
 * guardrail 17).
 *
 * A driver location older than `locationStaleMs` must be presented as stale —
 * the marker stops, and the UI says when it was last updated. It must never be
 * interpolated forward to look like movement.
 */
export const Freshness = {
  /** Driver GPS older than this is stale. */
  locationStaleMs: 60_000,
  /** A cart price older than this is re-fetched before checkout can proceed. */
  priceStaleMs: 120_000,
  /** Polling interval when the WebSocket is down (§15 polling fallback). */
  trackingPollMs: 15_000,
} as const;
