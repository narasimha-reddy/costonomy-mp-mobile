import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { fetchOutletAgreements } from '@/services/credit';
import type { CreditAgreement } from '@/models/credit';

/**
 * Which suppliers have extended this outlet credit.
 *
 * <p>One request for the outlet rather than one per supplier. A list of
 * suppliers asking each row "do I have terms here" is a page of requests that
 * arrive in no particular order and render the answer late — and credit is the
 * fact that decides whether a kitchen can buy from a supplier at all, so it
 * should not be the last thing on the tile to appear.
 *
 * <p><b>The join is by store, and only the join is done here.</b> Every rupee
 * shown comes from the agreement the server sent, `available` included: what is
 * left to spend nets off reservations against orders already in flight, which
 * this app cannot see (§23A.24, guardrail 3).
 */
export function useOutletCredit() {
  const { accessToken } = useSession();
  const { outletId } = useOutlet();

  const query = useQuery({
    queryKey: ['outlet', outletId, 'credit', 'agreements'],
    queryFn: () => fetchOutletAgreements(accessToken as string, outletId as number),
    enabled: outletId != null && accessToken != null,
  });

  const byStore = useMemo(() => {
    const map = new Map<number, CreditAgreement>();
    (query.data ?? []).forEach((agreement) => map.set(agreement.supplierStoreId, agreement));
    return map;
  }, [query.data]);

  return {
    /** This supplier's agreement with this outlet, or null when there is none. */
    creditFor: (storeId: number): CreditAgreement | null => byStore.get(storeId) ?? null,
    loading: query.isPending,
  };
}
