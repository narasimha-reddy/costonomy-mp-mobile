import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiText } from '@/components/common';
import type { PaymentMethod } from '@/models/procurement';
import { Colors, Radius, Spacing } from '@/theme';

/**
 * How the order is funded.
 *
 * <p><b>Both methods are pills, and they differ only in hue.</b> Funding is one
 * fact with two answers, so it should be read in one place with one shape — a
 * plain-text "Prepaid" beside a filled "On credit" made the two look like
 * different kinds of statement rather than two values of the same field, and the
 * unfilled one was easy to miss entirely on a dense card.
 *
 * <p>Credit keeps the violet the palette reserves for it (`Colors.credit`:
 * "credit is supplier-funded and must never be visually confused with cash
 * payment"). Prepaid takes green, because the money is already secured.
 *
 * <p><b>The one cost, stated rather than hidden:</b> a green pill can sit on the
 * same card as a green status chip — `DELIVERED` and `COMPLETED` are `success`.
 * They are kept apart by position (the pill belongs to the money row, the chip
 * closes the card under a divider) and by their icons, and by the fact that both
 * greens then mean the same untroubling thing: settled, nothing to do. What the
 * pill must never do is borrow blue or amber, which would collide with
 * `PREPARING` and `READY_FOR_PICKUP` — the states a supplier is actually acting
 * on.
 *
 * <p>The icon is not decoration. §23A.48 forbids carrying meaning by colour
 * alone, so the clock, the tick and the wallet distinguish them without it.
 */
export function PaymentMethodPill({ method }: { method: PaymentMethod | null }) {
  // Absent stays absent. A missing method is not "Prepaid" by default.
  if (method == null) return null;

  // Every method named. This read `credit ? 'On credit' : 'Prepaid'`, written
  // when there were two, so a wallet order was labelled a card payment.
  const look = LOOKS[method] ?? LOOKS.PREPAID;
  const fg = look.credit ? Colors.credit : Colors.success;

  return (
    <View style={[styles.pill, { backgroundColor: look.credit ? Colors.creditLight : Colors.successLight }]}>
      <Ionicons name={look.icon} size={13} color={fg} />
      <MandiText variant="captionEmphasis" color={fg}>
        {look.label}
      </MandiText>
    </View>
  );
}

/**
 * Card and wallet are both money already secured, so both take green and differ
 * by icon and word; credit keeps its violet.
 */
const LOOKS: Record<PaymentMethod, { label: string; icon: keyof typeof Ionicons.glyphMap; credit: boolean }> = {
  PREPAID: { label: 'Prepaid', icon: 'checkmark-circle-outline', credit: false },
  WALLET: { label: 'From wallet', icon: 'wallet-outline', credit: false },
  CREDIT: { label: 'On credit', icon: 'time-outline', credit: true },
};

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.full,
  },
});
