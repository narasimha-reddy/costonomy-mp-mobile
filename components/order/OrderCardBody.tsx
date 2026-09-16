import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MandiText, PartyHeading } from '@/components/common';
import type { PaymentMethod, SupplierOrderItem } from '@/models/procurement';
import type { Money } from '@/utils/money';
import { formatMoney } from '@/utils/money';
import { ITEM_NAMES_SHOWN, summariseItems } from '@/utils/orders';
import { PaymentMethodPill } from './PaymentMethodPill';
import { ProductThumb } from '@/components/product/ProductThumb';
import { Colors, Radius, Spacing } from '@/theme';

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
  items: Pick<SupplierOrderItem, 'skuName' | 'productName' | 'productImageUrl'>[];
  orderNumber?: string | null;
  paymentMethod?: PaymentMethod | null;
  /** The figure this card is about. The caller chooses which one — a supplier
   *  reads what they committed to, a restaurant what they are paying. */
  amount?: Money | null;
  trailing?: React.ReactNode;
}) {
  const count = items.length;

  return (
    <View style={styles.block}>
      {/* Shared with the credit cards: a supplier reads "who and where" the same
          way wherever a restaurant appears. */}
      <PartyHeading primary={primary || 'Order'} secondary={secondary} trailing={trailing} />

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
        // Pictures share the names' line rather than taking one of their own.
        // The same three the names list, so the row reads as one statement about
        // the goods instead of two competing ones.
        <View style={styles.goods}>
          <View style={styles.thumbs}>
            {items.slice(0, ITEM_NAMES_SHOWN).map((item, index) => (
              <ProductThumb
                key={`${item.productName ?? item.skuName ?? 'item'}-${index}`}
                uri={item.productImageUrl}
                size={26}
                radius={Radius.sm}
              />
            ))}
          </View>
          <MandiText
            variant="caption"
            color={Colors.textPrimary}
            numberOfLines={1}
            style={styles.flex}
          >
            {summariseItems(items)}
          </MandiText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 2 },
  columns: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  left: { flex: 1, gap: 2, alignItems: 'flex-start' },
  goods: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  thumbs: { flexDirection: 'row', gap: 3 },
  right: { gap: 2, alignItems: 'flex-end' },
  flex: { flex: 1 },
});
