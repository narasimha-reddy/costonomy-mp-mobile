import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiText } from '@/components/common';
import type { OrderTrackingView, TrackerStage } from '@/lib/delivery/orderTracking';
import { AvatarSize, Colors, Elevation, IconSize, Radius, Spacing } from '@/theme';

const ICON: Record<TrackerStage, keyof typeof Ionicons.glyphMap> = {
  bag: 'bag-handle',
  cube: 'cube',
  bicycle: 'bicycle',
  done: 'checkmark-circle',
};

/**
 * The dark bar that floats above the tab bar for the restaurant's most recent order in flight: what is happening now
 * and a way into it. It shows what the tracker says, no more; opening it lands on the order, where the server's
 * state is authoritative.
 */
export function OrderInProgressBar({
  view, onPress, bottom = Spacing.md,
}: {
  view: Pick<OrderTrackingView, 'headline' | 'subline' | 'stage'>;
  onPress: () => void;
  bottom?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Order in progress: ${view.headline}. Track`}
      style={[styles.bar, { bottom }]}
    >
      <View style={styles.icon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Ionicons name={ICON[view.stage]} size={IconSize.md} color={Colors.primaryDark} />
      </View>
      <View style={styles.text}>
        <MandiText variant="bodyEmphasis" color={Colors.textInverse} numberOfLines={1}>{view.headline}</MandiText>
        {view.subline != null && (
          <MandiText variant="caption" color={Colors.onGradientMuted} numberOfLines={1}>{view.subline}</MandiText>
        )}
      </View>
      <MandiText variant="bodyEmphasis" color={Colors.primary}>Track ›</MandiText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md - 2,
    minHeight: AvatarSize.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.md + 2,
    backgroundColor: Colors.inProgressBar,
    ...Elevation.floating,
  },
  icon: {
    width: AvatarSize.md - 4,
    height: AvatarSize.md - 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1 },
});
