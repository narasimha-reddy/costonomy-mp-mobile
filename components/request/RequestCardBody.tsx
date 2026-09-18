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
import { formatAgeOrMoment } from '@/utils/dateRange';
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
  occurredAt,
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
  /**
   * When the request was raised.
   *
   * <p>Shown as "20 hrs ago" while that is the useful fact, and as the date
   * once it is not — on a card from this morning the age is what you want and
   * the date is clutter, while "23 days ago" makes you count backwards to
   * something the date would have told you outright.
   */
  occurredAt?: string | null;
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
      {/* Which request, and how long it has been sitting there. Both are
          reference rather than headline, so they share one quiet line above the
          party — the same pair the order card carries, in one row because a
          request has a clock below competing for attention. */}
      {(reference != null || occurredAt != null) && (
        <View style={styles.topRow}>
          <MandiText variant="caption" color={Colors.textTertiary} numberOfLines={1}>
            {reference}
          </MandiText>
          {occurredAt != null && (
            <MandiText variant="caption" color={Colors.textTertiary} numberOfLines={1}>
              {formatAgeOrMoment(occurredAt)}
            </MandiText>
          )}
        </View>
      )}

      <PartyHeading primary={primary || 'Request'} secondary={secondary} trailing={trailing} />

      {/* Left, under the party, because it belongs to them: this is what this
          supplier's answer is worth, not a figure floating opposite a name. */}
      <View style={styles.valueRow}>
        {amount != null ? <MandiText variant="price">{formatMoney(amount)}</MandiText> : null}
        <MandiText variant="caption" color={Colors.textTertiary}>
          {amountLabel ?? `${count} item${count === 1 ? '' : 's'}`}
        </MandiText>
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

      {/* The clock and what this request is, last and together. They are the
          two facts that change while the card sits on screen, and reading them
          as a pair is what tells somebody whether to act now. */}
      <View style={styles.footerRow}>
        {/* Status first: it is the one thing every card has, so it anchors the
            row rather than shifting position depending on whether a clock
            happens to be running. */}
        <MandiStatusChip {...status} size="sm" />
        {running ? (
          <View style={styles.clock}>
            {/* Matched to the status chip beside it: the small countdown is a
                12px-rounded box with more vertical padding, and next to a pill
                the two read as two different kinds of object on one line rather
                than as a pair. */}
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
  clock: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  // The status chip's own metrics, so the two sit as a matched pair.
  clockPill: { paddingVertical: 2, paddingHorizontal: Spacing.sm, borderRadius: Radius.full },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
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
  goods: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  thumbs: { flexDirection: 'row', gap: 2 },
});
