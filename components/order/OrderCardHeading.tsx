import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MandiText } from '@/components/common';
import type { PaymentMethod, SupplierOrderItem } from '@/models/procurement';
import { summariseItems } from '@/utils/orders';
import { PaymentMethodPill } from './PaymentMethodPill';
import { Colors, Spacing } from '@/theme';

/**
 * The identity block every order card shares.
 *
 * <p>The order number used to lead. It is the wrong thing to lead with: nobody
 * recognises `MP-260915-000004`, and a supplier scanning a list is asking *who
 * is this for*, *where is it going* and *what is on it*. So the place leads, the
 * counterparty and whereabouts follow, then the goods — and the number drops to
 * a footer line of its own, where it is still there to quote but is no longer
 * competing with any of that.
 *
 * <p>One component rather than five copies so the cards cannot drift apart: an
 * order looks the same on the supplier's list, the supplier's home, the
 * restaurant's list and the restaurant's home.
 */
export function OrderCardHeading({
  primary,
  secondary,
  items,
  orderNumber,
  paymentMethod,
  trailing,
}: {
  primary: string | null | undefined;
  /** Nulls are dropped rather than rendered as gaps — an absent fact stays absent. */
  secondary: (string | null | undefined)[];
  items: Pick<SupplierOrderItem, 'skuName' | 'productName'>[];
  orderNumber?: string | null;
  paymentMethod?: PaymentMethod | null;
  trailing?: React.ReactNode;
}) {
  const detail = secondary.filter(Boolean).join(' · ');

  return (
    <View style={styles.block}>
      {/* Only the title shares a row with the chip. Wrapping every line in a
          column beside it narrowed all of them by the chip's width, and the
          first thing that cost was the end of the secondary line. */}
      <View style={styles.titleRow}>
        <MandiText variant="bodyEmphasis" numberOfLines={1} style={styles.flex}>
          {primary || 'Order'}
        </MandiText>
        {trailing}
      </View>

      {detail ? (
        <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1}>
          {detail}
        </MandiText>
      ) : null}

      {items.length > 0 ? (
        <MandiText variant="caption" color={Colors.textPrimary} numberOfLines={1}>
          {summariseItems(items)}
        </MandiText>
      ) : null}

      {orderNumber || paymentMethod ? (
        <View style={styles.footerRow}>
          <MandiText variant="caption" color={Colors.textTertiary} numberOfLines={1}>
            {orderNumber}
          </MandiText>
          <PaymentMethodPill method={paymentMethod ?? null} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 2 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  flex: { flex: 1 },
});
