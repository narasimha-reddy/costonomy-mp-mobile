import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiText } from '@/components/common';
import type { TrackerBanner } from '@/lib/delivery/orderTracking';
import { Colors, IconSize, Radius, Spacing } from '@/theme';

/** The amber note for a delay or a partner change: what happened, and that the page keeps itself up to date. */
export function TrackingBanner({ banner }: { banner: TrackerBanner }) {
  return (
    <View style={styles.card} accessibilityRole="alert">
      <Ionicons name="alert-circle-outline" size={IconSize.md} color={Colors.warningText} />
      <View style={styles.text}>
        <MandiText variant="bodyEmphasis" color={Colors.warningText}>{banner.title}</MandiText>
        <MandiText variant="caption" color={Colors.warningText}>{banner.body}</MandiText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md - 2,
    backgroundColor: Colors.warningBanner,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg - 2,
    paddingVertical: Spacing.md,
  },
  text: { flex: 1, gap: 2 },
});
