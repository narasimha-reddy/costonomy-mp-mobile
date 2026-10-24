import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Colors, Elevation, Radius, Spacing, TrackingLayout } from '@/theme';

/**
 * The sheet that rides up over the top area, with a grab handle. The handle is a visual cue only: the sheet scrolls
 * with the page rather than being dragged.
 */
export function TrackingSheet({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.sheet}>
      <View style={styles.grab} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flexGrow: 1,
    marginTop: -TrackingLayout.sheetOverlap,
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    backgroundColor: Colors.background,
    ...Elevation.modal,
  },
  grab: {
    alignSelf: 'center',
    width: TrackingLayout.grabWidth,
    height: TrackingLayout.grabHeight,
    borderRadius: TrackingLayout.grabHeight / 2,
    backgroundColor: Colors.sheetHandle,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  content: {
    paddingHorizontal: Spacing.screenHorizontal,
    paddingBottom: Spacing.lg,
    gap: Spacing.listGap - 2,
  },
});
