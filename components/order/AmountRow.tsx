import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MandiText } from '@/components/common/MandiText';
import { Spacing, type TextVariant } from '@/theme';

/**
 * A label and the amount it is for: the label takes the room left and wraps, the amount stays whole on one line,
 * right aligned. In one string the "-" of a refund broke away from its figure, and a long label pushed the figure
 * onto a line of its own.
 */
export function AmountRow({ label, amount, variant = 'body', color, style }: {
  label: string;
  /** Already formatted, e.g. `-₹26.00`. */
  amount: string;
  variant?: TextVariant;
  color?: string;
  style?: object;
}) {
  return (
    <View style={[styles.row, style]} accessible accessibilityLabel={`${label}, ${amount}`}>
      <MandiText variant={variant} color={color} style={styles.label}>{label}</MandiText>
      <MandiText variant={variant} color={color} numberOfLines={1} style={styles.amount}>{amount}</MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.md },
  label: { flex: 1, minWidth: 0 },
  amount: { flexShrink: 0, textAlign: 'right' },
});
