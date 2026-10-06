import { useCallback, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { addIntentItem, removeIntentItem, updateIntentItem } from '@/services/intent';
import { draftsKey } from '@/lib/queryKeys';
import { useToast } from '@/components/common';
import { useDebouncedEdits } from '@/hooks/useDebouncedEdits';
import { ApiError } from '@/lib/api/errors';
import type { Intent, IntentItem } from '@/models/intent';

/**
 * How many packs of a SKU are in the basket, and changing it from a stepper.
 *
 * <p>Extracted from the product screen when the supplier storefront needed the
 * same behaviour. Two copies of this would have drifted the first time either
 * was touched — and what they would drift on is how many of something a kitchen
 * is buying.
 *
 * <p>Four problems it solves, none of which is obvious from a stepper:
 *
 * <ul>
 *   <li><b>The cart is a round trip away.</b> A stepper that waits for one
 *       counts wrong when tapped twice, because the second tap reads a quantity
 *       the first has not changed yet — three taps land as two. So a tapped
 *       value is held locally, shown at once, and released when the cart comes
 *       back agreeing.</li>
 *   <li><b>A burst of taps is one decision.</b> Four taps on "+" would race
 *       four requests to set the last value. The quantity is absolute rather
 *       than an increment, so only the final tap is worth sending.</li>
 *   <li><b>Leaving the screen does not drop a tap.</b> A change still waiting
 *       its turn is sent when the screen goes, not thrown away with its
 *       timer.</li>
 *   <li><b>Zero is not a quantity.</b> It is the absence of the line, so it
 *       removes rather than writing a zero the server would have to interpret.</li>
 * </ul>
 */
export function useCartQuantity(drafts: Intent[]) {
  const { accessToken } = useSession();
  const { outletId } = useOutlet();
  const queryClient = useQueryClient();
  const toast = useToast();

  /**
   * Request lines by SKU.
   *
   * <p>The SKU is the join, and it is also what the line stores: a request
   * carries no offer and no price, because what a thing costs is the supplier's
   * answer rather than something the basket can know.
   */
  const inCart = useMemo(() => {
    const map = new Map<number, IntentItem>();
    drafts.forEach((draft) =>
      draft.items.forEach((item) => map.set(item.supplierSkuId, item)));
    return map;
  }, [drafts]);

  // The latest cart, for a commit that runs after the screen has gone: it must
  // read what the cart says now, not what it said when the hook last rendered.
  const inCartRef = useRef(inCart);
  inCartRef.current = inCart;
  const sessionRef = useRef({ accessToken, outletId });
  sessionRef.current = { accessToken, outletId };

  const edits = useDebouncedEdits(async (skuId, packs) => {
    const { accessToken: token, outletId: outlet } = sessionRef.current;
    const line = inCartRef.current.get(skuId);
    try {
      if (line == null) {
        // The SKU decides which supplier, and therefore which request this
        // lands on. Packs, because that is what is being asked for.
        await addIntentItem(token as string, outlet as number, {
          supplierSkuId: skuId,
          quantity: String(packs),
        });
      } else if (packs <= 0) {
        await removeIntentItem(token as string, line.id);
      } else {
        await updateIntentItem(token as string, line.id, String(packs));
      }
    } catch (error) {
      // The server's own words. §23A.8: a refusal explains itself, and a
      // generic "something went wrong" is what makes a user try again.
      toast.show(
        error instanceof ApiError ? error.message : 'Could not update your cart.',
        'error',
      );
    }
    // Awaited, then released: dropping the held value before the cart has
    // refetched would flash the old quantity for a frame. Also on failure, so
    // the stepper goes back to where the cart says it is.
    await queryClient.invalidateQueries({ queryKey: draftsKey(outlet) });
  });

  const queueChange = edits.set;

  /** What the stepper should show: the tapped value, else the cart's. */
  const packsFor = useCallback((skuId: number) => {
    const line = inCart.get(skuId);
    return edits.valueFor(skuId, line == null ? 0 : Number(line.requestedQuantity));
  }, [edits, inCart]);

  /**
   * What this line comes to, as the server has it.
   *
   * <p><b>Read, never multiplied.</b> Price times quantity is arithmetic on
   * money, which guardrail 3 puts on the server — and the basket already
   * carries the figure, computed the same way the order will be. Null before
   * anything is in the cart, where there is no line and so no total.
   */
  const lineTotalFor = useCallback((skuId: number) => {
    return inCart.get(skuId)?.agreedLineTotal ?? null;
  }, [inCart]);

  return { packsFor, queueChange, lineTotalFor, inCart, flush: edits.flush };
}
