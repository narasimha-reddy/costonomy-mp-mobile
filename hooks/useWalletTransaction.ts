import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { walletTransactionKey } from '@/lib/queryKeys';
import { usePollWindow } from '@/hooks/useWalletInvoice';
import { fetchWalletTransaction } from '@/services/wallet';
import type { InvoiceStatus } from '@/models/wallet';

/** The detail of one wallet movement for the signed-in outlet. The app's query policy does not retry a 404. */
export function useWalletTransaction(entryId: string | undefined) {
  const { accessToken } = useSession();
  const { outlet } = useOutlet();
  const [status, setStatus] = useState<InvoiceStatus | null>(null);
  const { interval } = usePollWindow(status);
  const query = useQuery({
    queryKey: walletTransactionKey(outlet?.id, entryId),
    queryFn: () => fetchWalletTransaction(outlet?.id as number, entryId as string, accessToken as string),
    enabled: outlet != null && accessToken != null && entryId != null && entryId !== '',
    // While a bill just added is being read, keep asking so the Invoice row fills in.
    refetchInterval: (q) => interval(q.state.data?.invoice?.status),
  });
  const current = query.data?.invoice?.status ?? null;
  useEffect(() => { setStatus(current); }, [current]);
  return query;
}
