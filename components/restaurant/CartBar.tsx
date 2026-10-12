import React from 'react';
import { StickyActionBar } from '@/components/common/StickyActionBar';
import type { Money } from '@/utils/money';
import { ControlHeight, Spacing } from '@/theme';

/** The bar's own height, bar padding included, without the safe-area inset. */
export const CART_BAR_HEIGHT = ControlHeight.lg + Spacing.md * 2;
/** Room left under the last row beyond the bar, so nothing floating over the list covers it. */
export const MENU_BOTTOM_CLEARANCE = 72;

/**
 * What is in the cart, and the way to it.
 *
 * <p>Shared by the product comparison and a supplier's shelf, which are the two
 * places a kitchen adds things. Two copies drifted on the one line that matters
 * and a footer that says something different depending on which screen you
 * added from is worse than no footer.
 *
 * <p>The continue bar of {@code StickyActionBar}: "{n} items added" and
 * "Continue ›". It is still pressable when empty, because "did I add that" is a
 * real question. The bar carries no figure: a total was shown here before, but
 * the server prices the cart at checkout and that is where it is read.
 */
export function CartBar({
  count,
  supplierCount,
  disableWhenEmpty = false,
  cartElsewhere = false,
  onPress,
}: {
  count: number;
  /** Accepted so existing callers keep compiling; the bar no longer shows a figure (see above). */
  total?: Money | null;
  /** Only where the selection spans more than one: a shelf is one supplier. */
  supplierCount?: number;
  /**
   * An empty cart has nothing to continue to, so the bar says so and is inert. Opt-in, because the other screens that
   * show this bar count one supplier and have not told it about the rest of the cart.
   */
  disableWhenEmpty?: boolean;
  /** This screen's count is zero but the cart holds other suppliers' items: the way to it stays. */
  cartElsewhere?: boolean;
  onPress: () => void;
}) {
  const inert = disableWhenEmpty && count === 0 && !cartElsewhere;
  const label = count === 0
    ? inert ? 'Add items to continue' : 'Nothing added yet'
    : `${count} item${count === 1 ? '' : 's'} added`
      + (supplierCount != null && supplierCount > 1 ? ` · ${supplierCount} suppliers` : '');

  return (
    <StickyActionBar
      variant="continue"
      left={{ eyebrow: '', label }}
      ctaLabel="Continue ›"
      disabled={inert}
      onPress={onPress}
    />
  );
}
