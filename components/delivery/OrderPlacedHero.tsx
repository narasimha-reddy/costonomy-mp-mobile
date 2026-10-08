import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiText } from '@/components/common';
import { clockTime } from '@/lib/delivery/deliveryPartner';
import { Colors, IconSize, Radius, Spacing } from '@/theme';

const TICK_CIRCLE = 84;

/**
 * The first thing the buyer sees after placing an order: a dark card saying when it was placed and with whom, a thin
 * progress bar, then a green tick circle and where it is going.
 *
 * <p>The bar is static (it only draws the step the server reports), so there is nothing to hold still for reduced
 * motion. The time is the device clock, as everywhere else on the tracking screen.
 */
export function OrderPlacedHero({
  placedAt, supplier, outletName, address, segments, segmentIndex, caption = 'Waiting for supplier confirmation',
}: {
  placedAt: string | null;
  supplier: string;
  outletName: string;
  address: string | null;
  segments: string[];
  segmentIndex: number;
  /** The line under the title; the supplier's version says what to do next. */
  caption?: string;
}) {
  const time = clockTime(placedAt);
  const title = time != null ? `Order placed at ${time}` : 'Order placed';
  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Ionicons name="time-outline" size={IconSize.xl} color={Colors.onGradient} />
          <View style={styles.cardText}>
            <MandiText variant="subtitle" color={Colors.onGradient} accessibilityRole="header">{title}</MandiText>
            <MandiText variant="caption" color={Colors.onGradientMuted}>{caption}</MandiText>
            <MandiText variant="caption" color={Colors.onGradientMuted}>{supplier}</MandiText>
          </View>
        </View>
        {segments.length > 0 && segmentIndex >= 0 && (
          <View
            style={styles.bar}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={`Step ${segmentIndex + 1} of ${segments.length}: ${segments[segmentIndex] ?? ''}`}
            accessibilityValue={{ min: 1, max: segments.length, now: segmentIndex + 1 }}
          >
            {segments.map((label, i) => (
              <View key={label} testID={`placed-segment-${i}`} style={[styles.segment, i <= segmentIndex && styles.segmentOn]} />
            ))}
          </View>
        )}
      </View>
      <View style={styles.body}>
        <View testID="placed-tick" style={styles.tick} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Ionicons name="checkmark" size={IconSize.hero} color={Colors.onGradient} />
        </View>
        <View style={styles.outletRow}>
          <Ionicons name="location-outline" size={IconSize.md} color={Colors.textPrimary} />
          <MandiText variant="subtitle" style={styles.outlet}>{outletName}</MandiText>
        </View>
        {address != null && address !== '' && (
          <MandiText variant="caption" color={Colors.textSecondary} style={styles.address}>{address}</MandiText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  card: {
    backgroundColor: Colors.inProgressBar,
    borderRadius: Radius.xl,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    padding: Spacing.lg - 2,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  cardText: { flex: 1, minWidth: 0 },
  bar: { flexDirection: 'row', gap: Spacing.xs, marginTop: Spacing.md },
  segment: { flex: 1, height: 5, borderRadius: Radius.sm / 2, backgroundColor: Colors.textSecondary },
  segmentOn: { backgroundColor: Colors.onGradient },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.xl },
  tick: {
    width: TICK_CIRCLE,
    height: TICK_CIRCLE,
    borderRadius: Radius.full,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  outletRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  outlet: { flexShrink: 1 },
  address: { marginTop: Spacing.xs + 2, textAlign: 'center' },
});
