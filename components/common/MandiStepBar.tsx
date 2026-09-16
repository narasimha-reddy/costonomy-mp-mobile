import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MandiText } from './MandiText';
import { Colors, Radius, Spacing } from '@/theme';

/**
 * Where you are in a short flow.
 *
 * <p>Stated in words as well as fill — §36 forbids carrying meaning in colour
 * alone, and a row of bars is the same problem in a different shape.
 */
export function MandiStepBar({
  step,
  total,
  label,
}: {
  step: number;
  total: number;
  label: string;
}) {
  return (
    <View
      style={styles.wrap}
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${step} of ${total}: ${label}`}
    >
      <View style={styles.bars}>
        {Array.from({ length: total }, (_, index) => (
          <View
            key={index}
            style={[styles.bar, index < step ? styles.barDone : styles.barTodo]}
          />
        ))}
      </View>
      <MandiText variant="caption" color={Colors.textSecondary}>
        Step {step} of {total} · {label}
      </MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.xs },
  bars: { flexDirection: 'row', gap: Spacing.xs },
  bar: { flex: 1, height: 4, borderRadius: Radius.full },
  barDone: { backgroundColor: Colors.primary },
  barTodo: { backgroundColor: Colors.border },
});
