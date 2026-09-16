import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiText } from '@/components/common';
import type { PaymentMethod } from '@/models/procurement';
import { Colors, Radius, Spacing } from '@/theme';

/**
 * How the order is funded.
 *
 * <p><b>Only credit is coloured.</b> An order card already carries a status chip,
 * and that chip uses every one of green, blue, amber, red and grey — so a filled
 * green "Prepaid" sat directly beside a green "Confirmed" and the two read as one
 * smeared signal. Prepaid is also the unremarkable case: the money is secured and
 * there is nothing to act on.
 *
 * <p>So prepaid is plain text and credit carries the violet this palette reserves
 * for it. That token exists for exactly this reason — see `Colors.credit`:
 * "credit is supplier-funded and must never be visually confused with cash
 * payment". The colour now means *this one is on credit*, which is the fact a
 * supplier actually acts on, and it can never be mistaken for a status.
 */
export function PaymentMethodPill({ method }: { method: PaymentMethod | null }) {
  // Absent stays absent. A missing method is not "Prepaid" by default.
  if (method == null) return null;

  const credit = method === 'CREDIT';

  return (
    <View style={[styles.pill, credit && styles.creditPill]}>
      <Ionicons
        name={credit ? 'time-outline' : 'checkmark-circle-outline'}
        size={13}
        color={credit ? Colors.credit : Colors.textSecondary}
      />
      <MandiText
        variant="captionEmphasis"
        color={credit ? Colors.credit : Colors.textSecondary}
      >
        {credit ? 'On credit' : 'Prepaid'}
      </MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingVertical: 2,
  },
  creditPill: {
    backgroundColor: Colors.creditLight,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.full,
  },
});
