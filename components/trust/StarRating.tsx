import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiText } from '@/components/common';
import { Colors, Spacing, TouchTarget } from '@/theme';

const LABELS = ['', 'Poor', 'Below par', 'Fine', 'Good', 'Excellent'];

/**
 * A 1–5 rating.
 *
 * <p>The chosen value is announced in words as well as stars: §36 forbids relying
 * on colour alone, and a row of filled shapes is the same problem — it carries
 * meaning only if you can see how many are filled.
 */
export function StarRating({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: number | null;
  onChange: (value: number) => void;
  required?: boolean;
}) {
  return (
    <View style={styles.block}>
      <View style={styles.header}>
        <MandiText variant="body">
          {label}
          {required ? ' *' : ''}
        </MandiText>
        {value != null && (
          <MandiText variant="caption" color={Colors.textSecondary}>
            {LABELS[value]}
          </MandiText>
        )}
      </View>
      <View style={styles.stars} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {[1, 2, 3, 4, 5].map((star) => {
          const filled = value != null && star <= value;
          return (
            <Pressable
              key={star}
              onPress={() => onChange(star)}
              accessibilityRole="radio"
              accessibilityState={{ selected: value === star }}
              accessibilityLabel={`${star} out of 5, ${LABELS[star]}`}
              style={styles.star}
            >
              <Ionicons
                name={filled ? 'star' : 'star-outline'}
                size={28}
                color={filled ? Colors.warning : Colors.textTertiary}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: Spacing.xs, marginTop: Spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stars: { flexDirection: 'row', gap: Spacing.xs },
  star: {
    width: TouchTarget.min,
    height: TouchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
