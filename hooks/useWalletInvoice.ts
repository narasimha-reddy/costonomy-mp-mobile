import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { walletInvoiceKey, walletTransactionKey } from '@/lib/queryKeys';
import { POLL_INTERVAL_MS, POLL_LIMIT_MS, shouldPoll } from '@/lib/wallet/bill';
import type { BillFile, InvoiceStatus } from '@/models/wallet';
import { deleteWalletInvoice, fetchWalletInvoice, uploadWalletInvoice } from '@/services/wallet';

/**
 * The 90-second window in which a bill that is being read is asked about every 2.5 seconds.
 *
 * <p>`interval(status)` is for a query's `refetchInterval`; `gaveUp` turns true when the window
 * has run out with the bill still READING, so the screen can say "Still reading, check back later"
 * instead of waiting forever. The window restarts only when the bill leaves READING and comes back.
 */
export function usePollWindow(status: InvoiceStatus | null | undefined) {
  const started = useRef<number | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const reading = status === 'READING';

  useEffect(() => {
    if (!reading) {
      started.current = null;
      setGaveUp(false);
      return undefined;
    }
    if (started.current == null) started.current = Date.now();
    const left = Math.max(0, POLL_LIMIT_MS - (Date.now() - started.current));
    const timer = setTimeout(() => setGaveUp(true), left);
    return () => clearTimeout(timer);
  }, [reading]);

  const interval = useCallback((current: InvoiceStatus | null | undefined): number | false => {
    if (current !== 'READING') return false;
    if (started.current == null) started.current = Date.now();
    return shouldPoll(current, started.current, Date.now()) ? POLL_INTERVAL_MS : false;
  }, []);

  return { gaveUp, interval };
}

/** The bill of one wallet payment, asked again every 2.5 s while it is being read. A 404 is "no bill", not retried. */
export function useWalletInvoice(entryId: string | undefined) {
  const { accessToken } = useSession();
  const { outlet } = useOutlet();
  const [status, setStatus] = useState<InvoiceStatus | null>(null);
  const { gaveUp, interval } = usePollWindow(status);

  const query = useQuery({
    queryKey: walletInvoiceKey(outlet?.id, entryId),
    queryFn: () => fetchWalletInvoice(outlet?.id as number, entryId as string, accessToken as string),
    enabled: outlet != null && accessToken != null && entryId != null && entryId !== '',
    refetchInterval: (q) => interval(q.state.data?.status),
  });

  const current = query.data?.status ?? null;
  useEffect(() => { setStatus(current); }, [current]);

  return { ...query, gaveUp: gaveUp && current === 'READING' };
}

/** Upload a bill, then refresh the details page (and the bill) so the Invoice row shows. */
export function useUploadWalletInvoice(entryId: string | undefined) {
  const { accessToken } = useSession();
  const { outlet } = useOutlet();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ files, onProgress }: { files: BillFile[]; onProgress?: (fraction: number) => void }) =>
      uploadWalletInvoice(outlet?.id as number, entryId as string, files, accessToken as string, onProgress),
    onSuccess: async (invoice) => {
      client.setQueryData(walletInvoiceKey(outlet?.id, entryId), invoice);
      await client.invalidateQueries({ queryKey: walletTransactionKey(outlet?.id, entryId) });
    },
  });
}

/** Remove the bill, then refresh the details page so the Add bill action comes back. */
export function useDeleteWalletInvoice(entryId: string | undefined) {
  const { accessToken } = useSession();
  const { outlet } = useOutlet();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => deleteWalletInvoice(outlet?.id as number, entryId as string, accessToken as string),
    onSuccess: async () => {
      client.removeQueries({ queryKey: walletInvoiceKey(outlet?.id, entryId) });
      await client.invalidateQueries({ queryKey: walletTransactionKey(outlet?.id, entryId) });
    },
  });
}
