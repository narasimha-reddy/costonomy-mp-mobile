import React from 'react';
import { StyleSheet, View } from 'react-native';
import {
  MandiCountdown,
  MandiStatusChip,
  MandiText,
  PartyHeading,
} from '@/components/common';
import type { StatusDisplay } from '@/models/status';
import { ProductThumb } from '@/components/product/ProductThumb';
import type { IntentItem } from '@/models/intent';
import { ITEM_NAMES_SHOWN } from '@/utils/orders';
import { skuTitle } from '@/utils/skuLabel';
import { formatMoney, type Money } from '@/utils/money';
import { Colors, Radius, Spacing } from '@/theme';

/**
 * One request, as a card. The counterpart to `OrderCardBody`.
 *
 * <p><b>The clock leads, which is the one place this departs from the order
 * card.</b> An order card opens with who and where, because that is how a
 * supplier decides whether they can serve it. A request is the only thing on
 * either screen with time running against it, and on the supplier's side a
 * missed clock is a lost order — so the countdown takes the first line and
 * everything else follows it.
 *
 * <p>Below that the shape is deliberately the order card's: party and place,
 * then a reference-and-amount band, then the goods with their pictures. A
 * request and the order it becomes should read as two views of one thing.
 *
 * <p><b>No payment pill and no delivery.</b> Neither exists yet — that is the
 * point of a request — and an empty slot where the order card has one would
 * read as missing rather than as not-yet.
 */
export function RequestCardBody({
  primary,
  secondary,
  status,
  deadlineAt,
  deadlineSeconds,
  deadlineAction,
  reference,
  amount,
  amountLabel,
  items,
  trailing,
  footer,
}: {
  /** The other party: the supplier for a restaurant, the kitchen for a supplier. */
  primary: string | null | undefined;
  /** Nulls are dropped rather than rendered as gaps — an absent fact stays absent. */
  secondary: (string | null | undefined)[];
  status: StatusDisplay;
  /**
   * The live deadline, or null when none is running.
   *
   * <p>Which clock this is depends on the request's state: the supplier's time
   * to accept while it is open, the restaurant's time to order once answered.
   * The caller decides, because only the caller knows whose screen this is.
   */
  deadlineAt?: string | null;
  deadlineSeconds?: number | null;
  deadlineAction?: string;
  reference?: string | null;
  amount?: Money | null;
  /** What the amount is, in two or three words. */
  amountLabel?: string;
  items: IntentItem[];
  trailing?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const count = items.length;
  const running = deadlineAt != null;

  return (
    <View style={styles.block}>
      {/* The clock, or the status on its own when none is running. A finished
          request still needs to say what it is. */}
      <View style={styles.clockRow}>
        {running ? (
          // The small countdown hides its own label, which leaves a bare
          // "18:00" — a number with no unit of meaning. The card has the room,
          // so the label sits beside it rather than being dropped.
          <View style={styles.clock}>
            <MandiCountdown
              deadlineAt={deadlineAt}
              slaSeconds={deadlineSeconds ?? undefined}
              action={deadlineAction}
              size="sm"
            />
            {deadlineAction ? (
              <MandiText variant="caption" color={Colors.textSecondary}>
                {deadlineAction}
              </MandiText>
            ) : null}
          </View>
        ) : (
          <View style={styles.flex} />
        )}
        <MandiStatusChip {...status} size="sm" />
      </View>

      <PartyHeading primary={primary || 'Request'} secondary={secondary} trailing={trailing} />

      <View style={styles.columns}>
        <View style={styles.left}>
          {reference ? (
            <MandiText variant="caption" color={Colors.textTertiary} numberOfLines={1}>
              {reference}
            </MandiText>
          ) : null}
        </View>

        <View style={styles.right}>
          {amount != null ? <MandiText variant="price">{formatMoney(amount)}</MandiText> : null}
          {/* Same tone and size as the reference opposite it: both are
              reference, not headline, and a matched pair reads as one band. */}
          <MandiText variant="caption" color={Colors.textTertiary}>
            {amountLabel ?? `${count} item${count === 1 ? '' : 's'}`}
          </MandiText>
        </View>
      </View>

      {count > 0 ? (
        // Pictures share the names' line rather than taking one of their own,
        // exactly as the order card does it.
        <View style={styles.goods}>
          <View style={styles.thumbs}>
            {items.slice(0, ITEM_NAMES_SHOWN).map((item) => (
              <ProductThumb
                key={item.id}
                uri={item.sku?.imageUrl}
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
            {summariseRequestItems(items)}
          </MandiText>
        </View>
      ) : null}

      {footer}
    </View>
  );
}

/**
 * The goods, by name, with a count for what did not fit.
 *
 * <p>"3 items" tells nobody anything they can act on — a supplier is deciding
 * whether they have the stock, and that decision is about *which* goods. The
 * overflow is the number hidden, not the total: six shown three at a time reads
 * "+3", because the reader can already see the first three.
 */
export function summariseRequestItems(items: IntentItem[]): string {
  const names = items.map((item) => skuTitle(item.sku)).filter(Boolean);
  if (names.length === 0) {
    return `${items.length} item${items.length === 1 ? '' : 's'}`;
  }
  const shown = names.slice(0, ITEM_NAMES_SHOWN);
  const hidden = names.length - shown.length;
  return hidden > 0 ? `${shown.join(', ')} +${hidden}` : shown.join(', ');
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  block: { gap: 2 },
  clock: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, flex: 1 },
  clockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  columns: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  left: { flex: 1, gap: 2 },
  right: { alignItems: 'flex-end', gap: 2 },
  goods: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  thumbs: { flexDirection: 'row', gap: 2 },
});
