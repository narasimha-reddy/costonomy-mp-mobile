import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { walletTransactionKey } from '@/lib/queryKeys';
import { fetchWalletTransaction } from '@/services/wallet';

/** The detail of one wallet movement for the signed-in outlet. The app's query policy does not retry a 404. */
export function useWalletTransaction(entryId: string | undefined) {
  const { accessToken } = useSession();
  const { outlet } = useOutlet();
  return useQuery({
    queryKey: walletTransactionKey(outlet?.id, entryId),
    queryFn: () => fetchWalletTransaction(outlet?.id as number, entryId as string, accessToken as string),
    enabled: outlet != null && accessToken != null && entryId != null && entryId !== '',
  });
}
