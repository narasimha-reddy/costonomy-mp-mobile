import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MandiButton, MandiText } from '@/components/common';
import { Colors, Elevation, Radius, Spacing } from '@/theme';

/** After delivery: a way to say something is wrong, to the existing dispute flow. There is no rating here. */
export function ReportIssueCard({ onReport }: { onReport: () => void }) {
  return (
    <View style={styles.card}>
      <MandiText variant="bodyEmphasis">How did it go?</MandiText>
      <View style={styles.action}>
        <MandiButton label="Report an issue" variant="secondary" size="md" onPress={onReport} />
      </View>
      <MandiText variant="caption" color={Colors.textSecondary} style={styles.hint}>
        Shortage, damage or temperature. Check each line before you confirm.
      </MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg - 2,
    paddingVertical: Spacing.md,
    ...Elevation.card,
  },
  action: { marginTop: Spacing.sm },
  hint: { marginTop: Spacing.sm - 2 },
});
