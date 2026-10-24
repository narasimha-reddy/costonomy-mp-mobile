import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { ApiError } from '@/lib/api/errors';
import { isDefinitiveFailure, isKeyReuse, isPreviousAttemptFailed, isStillProcessing } from '@/lib/api/idempotency';
import { attemptKey, settleAttempt } from '@/lib/credit/attemptKeys';
import { confirmClaim, isClaimStateError, isOverpaymentError, rejectClaim } from '@/services/credit';
import { receivablesRootKey } from '@/lib/queryKeys';
import type { ClaimResponse } from '@/models/credit';

export const SIGN_IN_AGAIN_TEXT = 'Your session ended. Please sign in again.';
export const EARLIER_MAY_HAVE_WORKED_TEXT =
  'Your earlier confirmation may have gone through. We have refreshed the list: please check before trying again.';
export const STILL_PROCESSING_TEXT = "Still processing… we'll check again.";
export const DIDNT_GO_THROUGH_TEXT = "That didn't go through. Please try again.";
export const RETRY_TEXT = "Couldn't reach the server. Please try again.";
const FALLBACK_TEXT = 'Please check the details and try again.';

/** How long to wait before looking again at a request the server is still handling. */
const RECHECK_MS = 4000;

/** What to tell the person: the server's own words when it gave them, else plain text. */
function messageFor(caught: unknown): string {
  if (caught instanceof ApiError) {
    if (caught.isUnauthenticated) return SIGN_IN_AGAIN_TEXT;
    if (isOverpaymentError(caught) != null || caught.code === 'CREDIT_OVERPAYMENT' || isClaimStateError(caught)) {
      return caught.message !== '' ? caught.message : FALLBACK_TEXT;
    }
    if (isKeyReuse(caught)) return EARLIER_MAY_HAVE_WORKED_TEXT;
    if (isStillProcessing(caught)) return STILL_PROCESSING_TEXT;
    if (isPreviousAttemptFailed(caught)) return DIDNT_GO_THROUGH_TEXT;
    if (isDefinitiveFailure(caught)) return caught.message !== '' ? caught.message : FALLBACK_TEXT;
  }
  return RETRY_TEXT;
}

/**
 * Confirm or reject a restaurant's "Paid direct" claim, as the supplier.
 *
 * <p>Confirming moves money into the invoice, so it carries an idempotency key
 * held in `lib/credit/attemptKeys`: the same claim and amount reuse one key until
 * the outcome is known, so a double tap or a retry after a dropped connection
 * reaches one server operation. One request at a time (`inFlight`), the buttons
 * are off while it runs. The server decides the amount cap and the claim's state;
 * its message is shown as is. On success, the claims, agreements and invoices of
 * this store are refetched. The recovery is store-scoped (the restaurant hook
 * `useAttemptRecovery` is outlet-scoped and needs an OutletProvider).
 */
export function useDecideClaim() {
  const { accessToken } = useSession();
  const { storeId } = useStore();
  const queryClient = useQueryClient();
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current != null) clearTimeout(timer.current);
    };
  }, []);

  const refresh = useCallback(() => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['store', storeId, 'credit-claims'] }),
    queryClient.invalidateQueries({ queryKey: ['store', storeId, 'credit-agreements'] }),
    // What the store is owed changes the moment a claim is confirmed.
    queryClient.invalidateQueries({ queryKey: receivablesRootKey(storeId) }),
    // Every agreement's own screen and its invoices.
    queryClient.invalidateQueries({ queryKey: ['credit-agreement'] }),
    // And every supplier invoice detail (its claims and what it owes).
    queryClient.invalidateQueries({ queryKey: ['credit-invoice'] }),
  ]), [queryClient, storeId]);

  const run = useCallback(async (
    signature: string | null,
    call: (token: string) => Promise<ClaimResponse>,
  ): Promise<ClaimResponse | null> => {
    if (inFlight.current || accessToken == null) return null;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const response = await call(accessToken);
      if (signature != null) settleAttempt(signature);
      void refresh();
      return response;
    } catch (caught) {
      if (signature != null && isDefinitiveFailure(caught)) settleAttempt(signature);
      // The claim or the invoice may have moved on: show what is true now.
      if (!isDefinitiveFailure(caught) || isClaimStateError(caught) || isKeyReuse(caught)
        || (caught instanceof ApiError && caught.code === 'CREDIT_OVERPAYMENT')) {
        void refresh();
      }
      if (isStillProcessing(caught)) {
        if (timer.current != null) clearTimeout(timer.current);
        timer.current = setTimeout(() => { timer.current = null; void refresh(); }, RECHECK_MS);
      }
      if (mounted.current) setError(messageFor(caught));
      return null;
    } finally {
      inFlight.current = false;
      if (mounted.current) setPending(false);
    }
  }, [accessToken, refresh]);

  /** `amount` null confirms what was claimed (the server caps it). */
  const confirm = useCallback((claim: ClaimResponse, amount: string | null) => {
    const signature = ['claim-confirm', storeId, claim.id, amount ?? 'as-claimed'].join('|');
    const key = attemptKey(signature);
    return run(signature, (token) => confirmClaim(token, claim.id, key, amount ?? undefined));
  }, [run, storeId]);

  const reject = useCallback(
    (claim: ClaimResponse, reason: string) => run(null, (token) => rejectClaim(token, claim.id, reason)),
    [run],
  );

  const reset = useCallback(() => setError(null), []);

  return { confirm, reject, pending, error, reset };
}
