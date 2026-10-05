import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MandiText } from '@/components/common';
import { DELIVERY_DAY_CHOICES } from '@/lib/delivery/deliveryDay';
import { Colors, Radius, Spacing } from '@/theme';

/**
 * When the buyer would like these requests delivered: now, or a day.
 *
 * <p>One choice for the whole basket, because it is sent with it. A day and not
 * a slot: slots belong to each supplier and are booked when the order is
 * created, so the exact slot is chosen then, starting from this day. It is a
 * preference the supplier sees, not a promise.
 */
export function DeliveryDayChoice({
  value,
  onChange,
}: {
  /** Days from today, or null for immediate. */
  value: number | null;
  onChange: (offset: number | null) => void;
}) {
  return (
    <View style={styles.wrap}>
      <MandiText variant="captionEmphasis" color={Colors.textSecondary}>
        Delivery
      </MandiText>
      <View style={styles.chips}>
        {DELIVERY_DAY_CHOICES.map((choice) => {
          const active = value === choice.offset;
          return (
            <Pressable
              key={choice.label}
              onPress={() => onChange(choice.offset)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Delivery: ${choice.label}`}
              style={[styles.chip, active && styles.chipActive]}
            >
              <MandiText
                variant="caption"
                color={active ? Colors.surface : Colors.textSecondary}
              >
                {choice.label}
              </MandiText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
});
