import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { isOnlinePayOn } from '@/models/creditPay';
import { fetchCreditSummary } from '@/services/credit';

/**
 * Whether paying credit dues online is on, from the outlet's credit summary (the query the
 * overview already holds, so usually cached). While it loads, or on an older server that
 * sends no field, this is false and the screens behave as they always did.
 */
export function useOnlinePayOn(): boolean {
  const { accessToken } = useSession();
  const { outletId } = useOutlet();
  const summary = useQuery({
    queryKey: ['outlet', outletId, 'credit'],
    queryFn: () => fetchCreditSummary(accessToken as string, outletId as number),
    enabled: outletId != null && accessToken != null,
  });
  return isOnlinePayOn(summary.data);
}
