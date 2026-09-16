import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiText } from '@/components/common';
import type { PaymentMethod } from '@/models/procurement';
import { Colors, Radius, Spacing } from '@/theme';

/**
 * How the order is funded, colour-coded.
 *
 * <p>The two are not variations of one thing, which is why they are not one
 * colour: prepaid money is already secured and the supplier is owed nothing,
 * while a credit order is a receivable against a limit they themselves granted.
 * Green and amber say that at a glance. Neither is red — nothing here has gone
 * wrong, and credit is a facility the supplier chose to offer.
 */
export function PaymentMethodPill({ method }: { method: PaymentMethod | null }) {
  // Absent stays absent. A missing method is not "Prepaid" by default.
  if (method == null) return null;

  const prepaid = method === 'PREPAID';
  const tone = prepaid ? Colors.success : Colors.warning;
  const background = prepaid ? Colors.successLight : Colors.warningLight;

  return (
    <View style={[styles.pill, { backgroundColor: background }]}>
      <Ionicons
        name={prepaid ? 'checkmark-circle' : 'time-outline'}
        size={12}
        color={tone}
      />
      <MandiText variant="captionEmphasis" color={tone}>
        {prepaid ? 'Prepaid' : 'On credit'}
      </MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
});
