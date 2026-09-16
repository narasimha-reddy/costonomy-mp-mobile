import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MandiText } from '@/components/common';
import type { PaymentMethod, SupplierOrderItem } from '@/models/procurement';
import type { Money } from '@/utils/money';
import { formatMoney } from '@/utils/money';
import { summariseItems } from '@/utils/orders';
import { PaymentMethodPill } from './PaymentMethodPill';
import { Colors, Spacing } from '@/theme';

/**
 * Everything on an order card, in the order its reader asks for it.
 *
 * <p>Four bands, and the grouping is the point. A flat stack of facts is what
 * made this card cluttered: seven lines, each as loud as the next, with the
 * money pinned to a row labelled "Order value" that said nothing the ₹ sign did
 * not already say.
 *
 * <ol>
 *   <li><b>Who and where</b> — the outlet, then the counterparty, locality and
 *       distance. The status chip rides the title.</li>
 *   <li><b>How it is paid and what it is called</b>, against <b>what it is worth
 *       and how much of it there is</b> — two columns, so the four facts read as
 *       two pairs rather than four lines. The dominant figure in each column
 *       leads; the reference numbers sit beneath in the same quiet tone,
 *       because a person reaches for them only when they already know why.</li>
 *   <li><b>The goods, by name</b>, last — it is the widest line and the one a
 *       reader scans rather than parses.</li>
 * </ol>
 *
 * <p>One component rather than five copies so the cards cannot drift apart: an
 * order looks the same on the supplier's list, the supplier's home, the
 * restaurant's list and the restaurant's home.
 */
export function OrderCardBody({
  primary,
  secondary,
  items,
  orderNumber,
  paymentMethod,
  amount,
  trailing,
}: {
  primary: string | null | undefined;
  /** Nulls are dropped rather than rendered as gaps — an absent fact stays absent. */
  secondary: (string | null | undefined)[];
  items: Pick<SupplierOrderItem, 'skuName' | 'productName'>[];
  orderNumber?: string | null;
  paymentMethod?: PaymentMethod | null;
  /** The figure this card is about. The caller chooses which one — a supplier
   *  reads what they committed to, a restaurant what they are paying. */
  amount?: Money | null;
  trailing?: React.ReactNode;
}) {
  const detail = secondary.filter(Boolean).join(' · ');
  const count = items.length;

  return (
    <View style={styles.block}>
      {/* Only the title shares a row with the chip. Wrapping every line in a
          column beside it narrowed all of them by the chip's width. */}
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

      <View style={styles.columns}>
        <View style={styles.left}>
          <PaymentMethodPill method={paymentMethod ?? null} />
          {orderNumber ? (
            <MandiText variant="caption" color={Colors.textTertiary} numberOfLines={1}>
              {orderNumber}
            </MandiText>
          ) : null}
        </View>

        <View style={styles.right}>
          {amount != null ? <MandiText variant="price">{formatMoney(amount)}</MandiText> : null}
          {count > 0 ? (
            // Same tone and size as the order number opposite it: both are
            // reference, not headline, and a matched pair reads as one band.
            <MandiText variant="caption" color={Colors.textTertiary}>
              {count} item{count === 1 ? '' : 's'}
            </MandiText>
          ) : null}
        </View>
      </View>

      {count > 0 ? (
        <MandiText variant="caption" color={Colors.textPrimary} numberOfLines={1}>
          {summariseItems(items)}
        </MandiText>
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
  columns: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  left: { flex: 1, gap: 2, alignItems: 'flex-start' },
  right: { gap: 2, alignItems: 'flex-end' },
  flex: { flex: 1 },
});
