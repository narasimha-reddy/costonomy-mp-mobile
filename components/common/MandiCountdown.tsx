import React, { useEffect, useState } from 'react';
import { AppState, StyleSheet, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Countdown,
  CountdownPalette,
  IconSize,
  Radius,
  Spacing,
  countdownLevel,
} from '@/theme';
import { secondsUntil } from '@/lib/server-clock';
import { MandiText } from './MandiText';

interface MandiCountdownProps {
  /** The order's `responseDeadlineAt`, ISO-8601, straight from the API. */
  deadlineAt: string | null | undefined;
  /**
   * That order's configured SLA window in seconds (`response_sla_seconds`).
   * Used only to decide when the display turns amber and then red, so the
   * thresholds stay proportionate for a store configured to something other
   * than the 60s default. Defaults to 60 to match the platform default.
   */
  slaSeconds?: number;
  size?: 'sm' | 'lg';
  /**
   * What the window is for, as a verb phrase — "to respond", "to order".
   *
   * <p>This component was written for the supplier's acceptance SLA and said
   * "to respond" unconditionally. A restaurant counting down its window to
   * create an order is not responding to anything, and being told it is makes
   * the one number they are acting on describe somebody else's job.
   */
  action?: string;
  /** Called once when the countdown reaches zero — e.g. to refetch the order. */
  onExpire?: () => void;
  style?: ViewStyle;
  testID?: string;
}

function format(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * The supplier response countdown. PRD §11, §13, §23A.33–34.
 *
 * Two things make this correct rather than merely animated:
 *
 *  1. **It recomputes from the deadline on every tick** instead of decrementing
 *     a counter. A decrementing counter drifts, and — the case §23A.34 calls out
 *     explicitly — is simply wrong after the app is backgrounded, because timers
 *     are throttled or suspended while backgrounded. Recomputing from an absolute
 *     deadline is right no matter how long the app was away or how many ticks
 *     were skipped. The `AppState` listener below re-reads immediately on resume
 *     rather than waiting up to a second for the next tick.
 *
 *  2. **It reads the server clock**, not `Date.now()`. See lib/server-clock.ts.
 *
 * Reaching zero here does not expire anything. It is a display, and `onExpire`
 * should refetch so the backend's verdict — accepted, or expired — is what the
 * supplier actually sees.
 */
export function MandiCountdown({
  deadlineAt,
  slaSeconds = 60,
  size = 'lg',
  action = 'to respond',
  onExpire,
  style,
  testID,
}: MandiCountdownProps) {
  const [remaining, setRemaining] = useState(() => secondsUntil(deadlineAt));

  // Resync when the order (and so the deadline) changes. Adjusting state during
  // render is React's documented pattern for this; doing it in an effect instead
  // would render one frame of the previous order's remaining time first.
  const [syncedDeadline, setSyncedDeadline] = useState(deadlineAt);
  if (deadlineAt !== syncedDeadline) {
    setSyncedDeadline(deadlineAt);
    setRemaining(secondsUntil(deadlineAt));
  }

  useEffect(() => {
    const tick = () => setRemaining(secondsUntil(deadlineAt));
    const timer = setInterval(tick, Countdown.tickMs);
    // Recompute the moment the app comes back rather than up to a tick later.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });

    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [deadlineAt]);

  const expired = remaining <= 0;

  useEffect(() => {
    if (expired) onExpire?.();
    // Deliberately keyed on `expired` alone: this must fire once on the
    // transition, not on every re-render while it stays expired.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired]);

  const level = countdownLevel(remaining, slaSeconds);
  const palette = CountdownPalette[level];
  const text = expired ? 'Expired' : format(remaining);

  return (
    <View
      testID={testID}
      style={[
        styles.container,
        { backgroundColor: palette.bg },
        size === 'sm' && styles.small,
        style,
      ]}
      accessible
      // Spelled out, because "0:47" is read as "zero colon forty-seven".
      accessibilityLabel={
        expired
          ? 'Window expired'
          : `${Math.floor(remaining / 60)} minutes ${remaining % 60} seconds left ${action}`
      }
      // Polite, not assertive: an assertive region would interrupt the screen
      // reader every single second.
      accessibilityLiveRegion={level === 'critical' ? 'polite' : 'none'}
    >
      <Ionicons
        name={expired ? 'close-circle' : 'time'}
        size={size === 'lg' ? IconSize.md : IconSize.sm}
        color={palette.fg}
      />
      <MandiText
        variant={size === 'lg' ? 'countdown' : 'numeric'}
        color={palette.fg}
      >
        {text}
      </MandiText>
      {size === 'lg' && !expired && (
        <MandiText variant="caption" color={palette.fg}>
          {action}
        </MandiText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
  },
  small: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
  },
});

export default MandiCountdown;
