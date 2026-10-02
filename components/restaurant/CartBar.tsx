import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MandiButton, MandiStickyBar, MandiText } from '@/components/common';
import { formatMoney, type Money } from '@/utils/money';
import { Colors, Spacing } from '@/theme';

/**
 * What is in the cart, and the way to it.
 *
 * <p>Shared by the product comparison and a supplier's shelf, which are the two
 * places a kitchen adds things. Two copies drifted on the one line that matters
 * — whether prices are settled yet — and a footer that says something different
 * depending on which screen you added from is worse than no footer.
 *
 * <p>The secondary variant when empty is deliberate: the cart is still reachable
 * with nothing in it, because "did I add that" is a real question, but it should
 * not compete with the shelf for attention.
 *
 * <p><b>Through {@code MandiStickyBar}</b>, which carries the surface, the top
 * border and the safe-area inset. Without it this was transparent text over
 * whatever happened to be scrolling behind it, and it sat on the home indicator.
 */
export function CartBar({
  count,
  total,
  supplierCount,
  onPress,
}: {
  count: number;
  /**
   * What the selection comes to, as the server has it.
   *
   * <p>Never summed here: totalling lines is arithmetic on money, and the
   * basket already carries the figure computed the way the order will compute
   * it (guardrail 3).
   */
  total?: Money | null;
  /** Only where the selection spans more than one — a shelf is one supplier. */
  supplierCount?: number;
  onPress: () => void;
}) {
  return (
    <MandiStickyBar>
      <View style={styles.bar}>
        <View style={styles.totals}>
          {/* What has been picked and what it comes to — the two things
              somebody filling a basket is tracking. It used to count suppliers
              and then say prices were still to come, which answered neither:
              on a single supplier's shelf the supplier count is always one, and
              a figure was available all along. */}
          <MandiText variant="caption" color={Colors.textSecondary}>
            {count === 0
              ? 'Nothing added yet'
              : `${count} item${count === 1 ? '' : 's'} selected`
                + (supplierCount != null && supplierCount > 1
                  ? ` · ${supplierCount} suppliers`
                  : '')}
          </MandiText>
          {count > 0 && total != null && (
            <MandiText variant="priceSmall">{formatMoney(total)}</MandiText>
          )}
        </View>
        <MandiButton
          label="View Cart"
          variant={count > 0 ? 'primary' : 'secondary'}
          onPress={onPress}
          fullWidth={false}
        />
      </View>
    </MandiStickyBar>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  totals: { flex: 1, gap: 2 },
});
