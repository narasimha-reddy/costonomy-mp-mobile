import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MandiText } from '@/components/common/MandiText';
import { Colors, Spacing } from '@/theme';

/**
 * The grey bar over a month's rows: "September 2026 ........ ₹0". `spent` is what the
 * wallet paid out that month, as the server totalled it; absent, the bar is the name alone.
 */
export function MonthHeader({ title, spent }: { title: string; spent: string | null }) {
  return (
    <View style={styles.bar} accessibilityRole="header" testID={`month-${title}`}>
      <MandiText variant="bodyEmphasis" style={styles.title}>{title}</MandiText>
      {spent != null && (
        <MandiText variant="bodyEmphasis" color={Colors.textSecondary}>
          {`${spent} spent`}
        </MandiText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.screenHorizontal,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surfaceSunken,
  },
  title: { flex: 1 },
});
