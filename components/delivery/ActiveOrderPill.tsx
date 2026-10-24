import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiText } from '@/components/common/MandiText';
import { Colors, Elevation, IconSize, Radius, Spacing, TouchTarget } from '@/theme';

/**
 * Room a scrolling screen leaves under its content so the floating pill never covers the last rows: the pill's
 * height (two text lines and padding, more with a larger font), its offset from the bottom, and a gap.
 */
export const ACTIVE_PILL_CLEARANCE = 120;

/**
 * The white pill that floats above the tab bar for the restaurant's most recent order in flight: who it is from, what
 * is happening now, and a way into tracking. It shows what the tracker header says, no more. The green ETA badge only
 * appears when the caller has a minutes figure, so a pill never promises a time nobody gave.
 */
export function ActiveOrderPill({
  supplierName, statusText, etaMins, onPress, bottom = Spacing.md, accessibilityLabel,
}: {
  supplierName: string;
  statusText: string;
  etaMins?: number | null;
  onPress: () => void;
  bottom?: number;
  /** Replaces the default "Order in progress" label, for a pill that is not about an order yet. */
  accessibilityLabel?: string;
}) {
  const hasEta = etaMins != null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `Order in progress: ${statusText}. ${supplierName}${hasEta ? `, arriving in ${etaMins} mins` : ''}. Track`}
      style={[styles.pill, { bottom }]}
    >
      <View style={styles.text}>
        <MandiText variant="captionEmphasis" color={Colors.textSecondary} numberOfLines={1}>{supplierName}</MandiText>
        <MandiText variant="bodyEmphasis" color={Colors.textPrimary} numberOfLines={1}>{statusText}</MandiText>
      </View>
      {hasEta && (
        <View style={styles.badge}>
          <MandiText variant="caption" color={Colors.onTrackHeader}>arriving in</MandiText>
          <MandiText variant="pillText" color={Colors.onTrackHeader}>{`${etaMins} mins`}</MandiText>
        </View>
      )}
      <Ionicons name="chevron-forward" size={IconSize.md} color={Colors.primaryDark} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: TouchTarget.min + Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingLeft: Spacing.lg,
    paddingRight: Spacing.md,
    borderRadius: 30,
    backgroundColor: Colors.surface,
    ...Elevation.floating,
  },
  text: { flex: 1 },
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.lg,
    backgroundColor: Colors.trackHeader,
  },
});
