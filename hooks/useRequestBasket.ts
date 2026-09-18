import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { fetchDrafts } from '@/services/intent';
import type { Intent } from '@/models/intent';
import { draftsKey } from '@/lib/queryKeys';

/**
 * The outlet's unsent requests — the basket.
 *
 * <p>A list, not a single cart, and that is the architecture rather than a
 * refactor: a request goes to one supplier, so shopping across three suppliers
 * builds three of them. The basket screen is a card each.
 *
 * <p><b>There is no total here, and there cannot be.</b> A request records what
 * is wanted and carries no prices — what it costs is the supplier's answer. Any
 * figure this hook could return would be one the app invented, which is exactly
 * what guardrail 3 forbids.
 */
export function useRequestBasket() {
  const { accessToken } = useSession();
  const { outletId } = useOutlet();

  const query = useQuery({
    queryKey: draftsKey(outletId),
    queryFn: () => fetchDrafts(accessToken as string, outletId as number),
    enabled: outletId != null && accessToken != null,
  });

  const drafts = query.data ?? [];

  return {
    drafts,
    supplierCount: drafts.length,
    itemCount: countItems(drafts),
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

/** Lines across every draft — what the tab badge counts. */
export function countItems(drafts: Intent[]): number {
  return drafts.reduce((total, draft) => total + draft.items.length, 0);
}
