import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Elevation, Spacing } from '@/theme';

/**
 * A bar pinned to the bottom of a screen — the cart total, the checkout CTA.
 *
 * <p>Carries its own safe-area inset. A sticky bar that stops at the screen edge
 * sits under the home indicator on every modern phone, which puts the primary
 * action of the screen where it cannot reliably be tapped.
 */
export function MandiStickyBar({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: Spacing.md + insets.bottom }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: Spacing.screenHorizontal,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceElevated,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    ...Elevation.floating,
  },
});
