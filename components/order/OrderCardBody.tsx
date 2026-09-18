import React from 'react';
import { StyleSheet, View } from 'react-native';
import {
  MandiCountdown,
  MandiStatusChip,
  MandiText,
  PartyHeading,
} from '@/components/common';
import type { StatusDisplay } from '@/models/status';
import type { PaymentMethod, SupplierOrderItem } from '@/models/procurement';
import type { Money } from '@/utils/money';
import { formatMoney } from '@/utils/money';
import { ITEM_NAMES_SHOWN, summariseItems } from '@/utils/orders';
import { formatAgeOrMoment } from '@/utils/dateRange';
import { PaymentMethodPill } from './PaymentMethodPill';
import { ProductThumb } from '@/components/product/ProductThumb';
import { Colors, Radius, Spacing } from '@/theme';

/**
 * Everything on an order card, in the order its reader asks for it.
 *
 * <p><b>Laid out as `RequestCardBody`</b>, because a request and the order it
 * becomes are two stages of one thing and a reader should not have to re-learn
 * where to look. Reference and age share a quiet line on top; the party leads;
 * the money sits under it on the left, where it belongs to them; the goods run
 * widest and last; and the status closes the card in a footer with whatever
 * clock is still running.
 *
 * <p>The grouping is the point. A flat stack of facts is what made this card
 * cluttered: seven lines, each as loud as the next, with the money pinned to a
 * row labelled "Order value" that said nothing the ₹ sign did not already say.
 *
 * <p>The payment pill sits beside the amount rather than in the footer: it says
 * how the money works, so it belongs to the money.
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
  createdAt,
  status,
  deadlineAt,
  deadlineSeconds,
  deadlineAction,
  trailing,
}: {
  primary: string | null | undefined;
  /** Nulls are dropped rather than rendered as gaps — an absent fact stays absent. */
  secondary: (string | null | undefined)[];
  items: Pick<SupplierOrderItem, 'sku' | 'productName' | 'productImageUrl'>[];
  orderNumber?: string | null;
  paymentMethod?: PaymentMethod | null;
  /** When the order was placed. Shown under the goods, as one line. */
  createdAt?: string | null;
  /** The figure this card is about. The caller chooses which one — a supplier
   *  reads what they committed to, a restaurant what they are paying. */
  amount?: Money | null;
  /** Closes the card, on the left, as it does on a request. */
  status?: StatusDisplay;
  /**
   * A clock still running against this order, if any.
   *
   * <p>Only a legacy order awaiting acceptance has one; an order built from a
   * request arrives already agreed and has nothing to count down.
   */
  deadlineAt?: string | null;
  deadlineSeconds?: number | null;
  deadlineAction?: string;
  /** Anything else for the title row. Status and clocks have their own slots. */
  trailing?: React.ReactNode;
}) {
  const count = items.length;
  const running = deadlineAt != null;

  return (
    <View style={styles.block}>
      {/* Which order, and how long it has been sitting there. Both are
          reference rather than headline, so they share one quiet line. */}
      {(orderNumber != null || createdAt != null) && (
        <View style={styles.topRow}>
          <MandiText variant="caption" color={Colors.textTertiary} numberOfLines={1}>
            {orderNumber}
          </MandiText>
          {createdAt != null && (
            <MandiText variant="caption" color={Colors.textTertiary} numberOfLines={1}>
              {formatAgeOrMoment(createdAt)}
            </MandiText>
          )}
        </View>
      )}

      {/* Shared with the credit cards: a supplier reads "who and where" the same
          way wherever a restaurant appears. */}
      <PartyHeading primary={primary || 'Order'} secondary={secondary} trailing={trailing} />

      <View style={styles.valueRow}>
        {amount != null ? <MandiText variant="price">{formatMoney(amount)}</MandiText> : null}
        {count > 0 ? (
          <MandiText variant="caption" color={Colors.textTertiary}>
            {count} item{count === 1 ? '' : 's'}
          </MandiText>
        ) : null}
        {/* Beside the money because it says how the money works. */}
        <PaymentMethodPill method={paymentMethod ?? null} />
      </View>

      {count > 0 ? (
        // Pictures share the names' line rather than taking one of their own.
        // The same three the names list, so the row reads as one statement about
        // the goods instead of two competing ones.
        <View style={styles.goods}>
          <View style={styles.thumbs}>
            {items.slice(0, ITEM_NAMES_SHOWN).map((item, index) => (
              <ProductThumb
                key={`${item.productName ?? item.sku?.skuName ?? 'item'}-${index}`}
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

      {(status != null || running) && (
        <View style={styles.footerRow}>
          {/* Status first, so it anchors the row rather than shifting position
              depending on whether a clock happens to be running. */}
          {status != null ? <MandiStatusChip {...status} size="sm" /> : <View style={styles.flex} />}
          {running ? (
            <View style={styles.clock}>
              <MandiCountdown
                deadlineAt={deadlineAt}
                slaSeconds={deadlineSeconds ?? undefined}
                action={deadlineAction}
                size="sm"
                style={styles.clockPill}
              />
              {deadlineAction ? (
                <MandiText variant="caption" color={Colors.textSecondary}>
                  {deadlineAction}
                </MandiText>
              ) : null}
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  block: { gap: 2 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  goods: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  thumbs: { flexDirection: 'row', gap: 2 },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
    marginTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderLight,
  },
  clock: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  // The status chip's own metrics, so the two sit as a matched pair.
  clockPill: { paddingVertical: 2, paddingHorizontal: Spacing.sm, borderRadius: Radius.full },
});
