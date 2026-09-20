import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { addIntentItem, removeIntentItem, updateIntentItem } from '@/services/intent';
import { draftsKey } from '@/lib/queryKeys';
import { useToast } from '@/components/common';
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
 * <p>Three problems it solves, none of which is obvious from a stepper:
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

  const [desired, setDesired] = useState<Record<number, number>>({});
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const pending = timers.current;
    return () => Object.values(pending).forEach(clearTimeout);
  }, []);

  const change = useMutation({
    mutationFn: async ({ skuId, packs }: { skuId: number; packs: number }) => {
      const line = inCart.get(skuId);
      if (line == null) {
        // The SKU decides which supplier, and therefore which request this
        // lands on. Packs, because that is what is being asked for.
        return addIntentItem(accessToken as string, outletId as number, {
          supplierSkuId: skuId,
          quantity: String(packs),
        });
      }
      return packs <= 0
        ? removeIntentItem(accessToken as string, line.id)
        : updateIntentItem(accessToken as string, line.id, String(packs));
    },
    onSuccess: async (_data, variables) => {
      // Awaited, then released: dropping the local value before the cart has
      // refetched would flash the old quantity for a frame.
      await queryClient.invalidateQueries({ queryKey: draftsKey(outletId) });
      setDesired((current) => {
        const next = { ...current };
        delete next[variables.skuId];
        return next;
      });
    },
    onError: (error, variables) => {
      // Put the stepper back where the cart says it is, rather than leaving it
      // showing a quantity the server refused.
      setDesired((current) => {
        const next = { ...current };
        delete next[variables.skuId];
        return next;
      });
      // The server's own words. §23A.8: a refusal explains itself, and a
      // generic "something went wrong" is what makes a user try again.
      toast.show(
        error instanceof ApiError ? error.message : 'Could not update your cart.',
        'error',
      );
    },
  });

  const queueChange = useCallback((skuId: number, packs: number) => {
    setDesired((current) => ({ ...current, [skuId]: packs }));
    clearTimeout(timers.current[skuId]);
    timers.current[skuId] = setTimeout(() => change.mutate({ skuId, packs }), 400);
  }, [change]);

  /** What the stepper should show: the tapped value, else the cart's. */
  const packsFor = useCallback((skuId: number) => {
    const held = desired[skuId];
    if (held != null) return held;
    const line = inCart.get(skuId);
    return line == null ? 0 : Number(line.requestedQuantity);
  }, [desired, inCart]);

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

  return { packsFor, queueChange, lineTotalFor, inCart };
}
