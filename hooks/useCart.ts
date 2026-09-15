import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { fetchCart } from '@/services/procurement';
import type { Procurement } from '@/models/procurement';
import { cartKey } from '@/lib/queryKeys';

/**
 * The outlet's open cart.
 *
 * <p>One query key for the whole app, so the header badge, the cart screen and
 * checkout all read the same cached answer and a line added on the product screen
 * updates every one of them.
 *
 * <p><b>404 is a legitimate answer</b>: an outlet with no open cart has no
 * procurement, which is not an error and must not render as one.
 */
export { cartKey };

export function useCart() {
  const { accessToken } = useSession();
  const { outletId } = useOutlet();

  const query = useQuery({
    queryKey: cartKey(outletId),
    queryFn: () => fetchCart(accessToken as string, outletId as number),
    enabled: outletId != null && accessToken != null,
  });

  const cart = query.data ?? null;

  return {
    cart,
    itemCount: countItems(cart),
    loading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  };
}

/** Invalidate every view of the cart after a mutation. */
export function useInvalidateCart() {
  const queryClient = useQueryClient();
  const { outletId } = useOutlet();
  return () => queryClient.invalidateQueries({ queryKey: cartKey(outletId) });
}

export function countItems(cart: Procurement | null): number {
  if (!cart) return 0;
  return cart.supplierGroups.reduce((total, group) => total + group.items.length, 0);
}
