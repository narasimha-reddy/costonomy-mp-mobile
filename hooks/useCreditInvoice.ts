import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { fetchCreditInvoice, fetchCreditSummary } from '@/services/credit';

/**
 * One credit invoice with its payments.
 *
 * <p>Keyed under the outlet so the pay sheet's outlet-scoped invalidation after a
 * repayment refreshes this screen too.
 */
export function useCreditInvoice(invoiceId: number) {
  const { accessToken } = useSession();
  const { outletId } = useOutlet();
  const query = useQuery({
    queryKey: ['outlet', outletId, 'credit', 'invoice', invoiceId],
    queryFn: () => fetchCreditInvoice(accessToken as string, invoiceId),
    enabled: Number.isFinite(invoiceId) && outletId != null && accessToken != null,
  });
  return { ...query, refresh: () => query.refetch() };
}

/** Whether the server allows repaying credit from the wallet. Absent means no. */
export function useWalletRepayEnabled(): boolean {
  const { accessToken } = useSession();
  const { outletId } = useOutlet();
  const summary = useQuery({
    queryKey: ['outlet', outletId, 'credit'],
    queryFn: () => fetchCreditSummary(accessToken as string, outletId as number),
    enabled: outletId != null && accessToken != null,
  });
  return summary.data?.walletRepayEnabled === true;
}
