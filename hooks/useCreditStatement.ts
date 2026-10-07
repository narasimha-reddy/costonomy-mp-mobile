import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { fetchCreditStatement } from '@/services/credit';
import type { CreditStatement } from '@/models/credit';

export interface StatementRange { from: string; to: string }

/**
 * One credit line's statement. The range is the caller's; with none, the server's
 * default (the last 90 days) applies and its answer says which days those were.
 *
 * <p>Under the outlet's credit key, so the pay-from-wallet sheet's invalidation of that
 * key refreshes an open statement too.
 */
export function useCreditStatement(agreementId: number, range: StatementRange | null) {
  const { accessToken } = useSession();
  const { outletId } = useOutlet();
  return useQuery<CreditStatement>({
    queryKey: ['outlet', outletId, 'credit', 'statement', agreementId, range?.from ?? null, range?.to ?? null],
    queryFn: () => fetchCreditStatement(accessToken as string, agreementId, range ?? {}),
    enabled: Number.isFinite(agreementId) && outletId != null && accessToken != null,
  });
}
