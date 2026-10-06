import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MandiText } from '@/components/common';
import { Colors, Radius, Spacing, TrackingLayout } from '@/theme';

/**
 * How far through the automatic search for a partner we are, over the server's window. It fills to the end and stops
 * there; it never claims a partner was found.
 */
export function SearchProgressBar({
  fraction, label, note,
}: {
  fraction: number;
  /** Left of the line under the bar: "12 of 30 min". */
  label: string;
  /** Right of it: "Auto-retrying". */
  note?: string;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  return (
    <View style={styles.wrap}>
      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: 100, now: pct }}
      >
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
      <View style={styles.text}>
        <MandiText variant="caption" color={Colors.textSecondary}>{label}</MandiText>
        {note != null && <MandiText variant="caption" color={Colors.textSecondary}>{note}</MandiText>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.sm - 1, marginTop: Spacing.sm },
  track: {
    height: TrackingLayout.segmentHeight,
    borderRadius: Radius.sm / 2,
    backgroundColor: Colors.progressTrack,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: Colors.primary },
  text: { flexDirection: 'row', justifyContent: 'space-between' },
});
