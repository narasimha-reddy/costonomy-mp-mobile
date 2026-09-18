import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { fetchDrafts } from '@/services/intent';

import { draftsKey } from '@/lib/queryKeys';

/**
 * The outlet's unsent requests — the basket.
 *
 * <p>A list, not a single cart, and that is the architecture rather than a
 * refactor: a request goes to one supplier, so shopping across three suppliers
 * builds three of them. The basket screen is a card each.
 *
 * <p>The totals it carries are <b>indicative</b> and come from the server: each
 * supplier's current listed price, so a kitchen can see roughly what it is about
 * to ask for. They commit nobody — the supplier's reply decides both quantity
 * and price — and nothing here adds money up, which is guardrail 3's actual
 * requirement.
 */
export function useRequestBasket() {
  const { accessToken } = useSession();
  const { outletId } = useOutlet();

  const query = useQuery({
    queryKey: draftsKey(outletId),
    queryFn: () => fetchDrafts(accessToken as string, outletId as number),
    enabled: outletId != null && accessToken != null,
  });

  const basket = query.data ?? null;

  return {
    basket,
    drafts: basket?.requests ?? [],
    supplierCount: basket?.supplierCount ?? 0,
    itemCount: basket?.itemCount ?? 0,
    loading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  };
}

/** Invalidate every view of the basket after a mutation. */
export function useInvalidateBasket() {
  const queryClient = useQueryClient();
  const { outletId } = useOutlet();
  return () => queryClient.invalidateQueries({ queryKey: draftsKey(outletId) });
}
