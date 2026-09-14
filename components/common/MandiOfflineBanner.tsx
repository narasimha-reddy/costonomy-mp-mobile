import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, IconSize, Spacing } from '@/theme';
import { MandiText } from './MandiText';

/**
 * The offline bar. PRD §23A.46, doc 05 §35.
 *
 * Wire it to `useNetworkStatus()`, mounted once in the root layout so it cannot
 * be forgotten on a screen. Its copy is deliberately about *reading*: the app
 * may serve cached data offline, but a state-changing action must never report
 * success while disconnected (guardrail: "never claim order/payment success
 * offline"). That rule is enforced at the mutation layer, not here.
 */
export function MandiOfflineBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <View
      style={styles.banner}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      testID="offline-banner"
    >
      <Ionicons name="cloud-offline" size={IconSize.sm} color={Colors.textInverse} />
      <MandiText variant="captionEmphasis" color={Colors.textInverse}>
        {`You're offline — showing saved data`}
      </MandiText>
    </View>
  );
}

/**
 * A "this data may be out of date" marker. PRD §23A.46 "Stale".
 *
 * Used on a cart price older than `Freshness.priceStaleMs` and on a driver
 * location older than `Freshness.locationStaleMs`. Stale is rendered grey, not
 * amber — it is unverified, not an error the user must act on.
 */
export function MandiStaleIndicator({
  label,
  testID,
}: {
  /** e.g. "Location last updated 4 min ago". Always name *when*, not just "stale". */
  label: string;
  testID?: string;
}) {
  return (
    <View style={styles.stale} testID={testID} accessible accessibilityLabel={label}>
      <Ionicons name="time-outline" size={IconSize.xs} color={Colors.stale} />
      <MandiText variant="caption" color={Colors.stale}>
        {label}
      </MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.offline,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  stale: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
});

export default MandiOfflineBanner;
