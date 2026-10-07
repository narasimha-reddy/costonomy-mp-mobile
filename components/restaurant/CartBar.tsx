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
  onPress,
}: {
  count: number;
  /** Accepted so existing callers keep compiling; the bar no longer shows a figure (see above). */
  total?: Money | null;
  /** Only where the selection spans more than one: a shelf is one supplier. */
  supplierCount?: number;
  onPress: () => void;
}) {
  const label = count === 0
    ? 'Nothing added yet'
    : `${count} item${count === 1 ? '' : 's'} added`
      + (supplierCount != null && supplierCount > 1 ? ` · ${supplierCount} suppliers` : '');

  return (
    <StickyActionBar
      variant="continue"
      left={{ eyebrow: '', label }}
      ctaLabel="Continue ›"
      onPress={onPress}
    />
  );
}
