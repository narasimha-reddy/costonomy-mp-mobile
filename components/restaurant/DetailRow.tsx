import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MandiText } from '@/components/common';
import { Colors, Spacing } from '@/theme';

/**
 * A label on the left and its value on the right.
 *
 * <p>The label keeps what it needs (up to 45% of the row) and the value takes the rest and wraps. Before, the label
 * took all the spare room and a long value, such as an address, squeezed it to nothing, so "Pickup" drew one letter
 * per line down the screen.
 */
export function DetailRow({
  label,
  value,
  emphasis,
  hint,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  hint?: string;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.label} testID="detail-row-label">
        <MandiText variant={emphasis ? 'bodyEmphasis' : 'body'} color={Colors.textSecondary}>
          {label}
        </MandiText>
        {hint && (
          <MandiText variant="caption" color={Colors.textTertiary}>{hint}</MandiText>
        )}
      </View>
      <MandiText
        variant={emphasis ? 'price' : 'body'}
        style={styles.value}
        testID="detail-row-value"
      >
        {value}
      </MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  label: { flexShrink: 0, maxWidth: '45%' },
  value: { flex: 1, textAlign: 'right' },
});
