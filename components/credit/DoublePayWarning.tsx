import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiText } from '@/components/common';
import { Colors, IconSize, Radius, Spacing } from '@/theme';

/** The "you may pay twice" banner above a wallet Pay button. */
export function DoublePayWarning({ text, testID = 'double-pay-warning' }: { text: string; testID?: string }) {
  return (
    <View style={styles.warning} accessibilityLiveRegion="polite" testID={testID}>
      <Ionicons name="warning" size={IconSize.md} color={Colors.warning} />
      <MandiText variant="body" style={styles.text}>{text}</MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.warningLight,
  },
  text: { flex: 1 },
});
