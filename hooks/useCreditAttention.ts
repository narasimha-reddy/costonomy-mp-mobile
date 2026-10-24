import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { fetchCreditAttention } from '@/services/credit';
import type { CreditAttention } from '@/models/credit';

const NONE: CreditAttention = { overdue: false, dueSoon: false };

/**
 * Whether this outlet has credit that is overdue or due soon.
 *
 * <p>Flags only, never amounts. A failed or pending request reads as "nothing":
 * the Home tile must neither hide a real alarm nor invent one because the
 * network dropped, and an absent dot is the quiet default.
 */
export function useCreditAttention(): CreditAttention {
  const { accessToken } = useSession();
  const { outletId } = useOutlet();

  const query = useQuery({
    queryKey: ['outlet', outletId, 'credit', 'attention'],
    queryFn: () => fetchCreditAttention(accessToken as string, outletId as number),
    enabled: outletId != null && accessToken != null,
    staleTime: 60_000,
    retry: 1,
  });

  if (query.isError || query.data == null) return NONE;
  return { overdue: query.data.overdue === true, dueSoon: query.data.dueSoon === true };
}
