import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useOutlet } from '@/contexts/OutletProvider';
import { walletKey } from '@/lib/queryKeys';

/** Said when the server cannot tell a repeated tap from a new one: the first may have worked. */
export const EARLIER_MAY_HAVE_WORKED_TEXT =
  "Your earlier payment may have gone through. We've refreshed your balance: please check before paying again.";
/** Said when the key is still being handled by the server. */
export const STILL_PROCESSING_TEXT = "Still processing… we'll check again.";
/** Said when the earlier try with the key failed for good. */
export const DIDNT_GO_THROUGH_TEXT = "That didn't go through. Please try again.";

/** How long to wait before looking again at a request the server is still handling. */
export const PROCESSING_RECHECK_MS = 4000;

/**
 * What the money screens do when an attempt's outcome is in doubt.
 *
 * <p>`refetchAll` re-reads the wallet, the outlet's credit summary, agreement and
 * invoices (everything under the outlet's credit key). `checkBeforeRetry` does that
 * and holds `checking` true until it is done, so a caller can keep its action off
 * until the person has seen the refreshed figures. `recheckLater` does it once more
 * after a short delay, for "still processing". Nothing here sets state after the
 * screen has gone (`isMounted`).
 */
export function useAttemptRecovery(agreementIds: readonly number[]) {
  const queryClient = useQueryClient();
  const { outletId } = useOutlet();
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [checking, setChecking] = useState(false);
  const ids = agreementIds.join(',');

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current != null) clearTimeout(timer.current);
    };
  }, []);

  const refetchAll = useCallback(async () => {
    await Promise.all([
      queryClient.refetchQueries({ queryKey: walletKey(outletId) }),
      queryClient.refetchQueries({ queryKey: ['outlet', outletId, 'credit'] }),
      ...(ids === '' ? [] : ids.split(',').map((id) =>
        queryClient.refetchQueries({ queryKey: ['credit-agreement', Number(id)] }))),
    ]);
  }, [ids, outletId, queryClient]);

  const checkBeforeRetry = useCallback(async () => {
    setChecking(true);
    try {
      await refetchAll();
    } finally {
      if (mounted.current) setChecking(false);
    }
  }, [refetchAll]);

  const recheckLater = useCallback(() => {
    if (timer.current != null) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; void refetchAll(); }, PROCESSING_RECHECK_MS);
  }, [refetchAll]);

  const isMounted = useCallback(() => mounted.current, []);

  return { checking, checkBeforeRetry, recheckLater, refetchAll, isMounted };
}
