import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { useToast } from '@/components/common';
import { ApiError } from '@/lib/api/errors';
import { isDefinitiveFailure, isKeyReuse, isPreviousAttemptFailed, isStillProcessing } from '@/lib/api/idempotency';
import { useAttemptRecovery } from '@/hooks/useAttemptRecovery';
import { attemptKey, settleAttempt } from '@/lib/credit/attemptKeys';
import { isClaimStateError, isOverpaymentError, submitClaim } from '@/services/credit';
import { formatMoney } from '@/utils/money';
import type { ClaimResponse, SubmitClaimRequest } from '@/models/credit';

/** What went wrong, in the terms the form words. Never a raw code. */
export type ClaimError =
  | { kind: 'overpayment'; outstanding: number }
  | { kind: 'state' }
  /** The same key was used with a different payload: the earlier try may have been filed. */
  | { kind: 'reuse' }
  /** The server is still handling this very attempt. */
  | { kind: 'processing' }
  /** The earlier try with this key failed for good. */
  | { kind: 'failed' }
  /** The session ended: sign in again; the form is kept. */
  | { kind: 'auth' }
  | { kind: 'invalid'; message: string }
  | { kind: 'retry' };

function classify(caught: unknown): ClaimError {
  const over = isOverpaymentError(caught);
  if (over != null) return { kind: 'overpayment', ...over };
  if (caught instanceof ApiError && caught.isUnauthenticated) return { kind: 'auth' };
  if (isClaimStateError(caught)) return { kind: 'state' };
  if (isKeyReuse(caught)) return { kind: 'reuse' };
  if (isStillProcessing(caught)) return { kind: 'processing' };
  if (isPreviousAttemptFailed(caught)) return { kind: 'failed' };
  if (isDefinitiveFailure(caught)) {
    const message = caught instanceof ApiError && caught.message !== ''
      ? caught.message : 'Please check the details and try again.';
    return { kind: 'invalid', message };
  }
  return { kind: 'retry' };
}

/**
 * Report a payment made outside the app.
 *
 * <p><b>The idempotency key belongs to one attempt, and outlives the screen.</b> It
 * is made once per distinct (outlet, invoice, amount, method, reference, day,
 * note) and sent again on a retry whose outcome is unknown (a 5xx, a dropped
 * connection), so a double tap or a retry can never file the same report twice.
 * The server hashes the note too, so changing it is a different attempt and gets
 * a new key (else the server would answer KEY_REUSE); success or a refusal ends
 * the attempt. The key is held in `lib/credit/attemptKeys`, not in the screen.
 *
 * <p>`IDEMPOTENCY_KEY_REUSE` never silently allows a new attempt: everything is
 * refreshed first and `checking` stays true until that is done.
 *
 * <p>The success toast is shown only once the server has answered. Nothing that
 * is owed changes until the supplier confirms; this only refreshes the screens.
 */
export function useSubmitClaim(target: { agreementId: number; supplierName: string }) {
  const { accessToken } = useSession();
  const { outletId } = useOutlet();
  const queryClient = useQueryClient();
  const toast = useToast();
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ClaimError | null>(null);

  const { agreementId, supplierName } = target;
  const recovery = useAttemptRecovery([agreementId]);
  const { isMounted, checkBeforeRetry, recheckLater } = recovery;

  const send = useCallback(async (
    invoiceId: number,
    body: SubmitClaimRequest,
  ): Promise<ClaimResponse | null> => {
    if (inFlight.current || recovery.checking || accessToken == null) return null;
    inFlight.current = true;
    setPending(true);
    setError(null);

    const signature = ['claim', outletId, invoiceId, body.amount, body.method, body.reference ?? '',
      body.paidOn, (body.note ?? '').trim()].join('|');
    const key = attemptKey(signature);

    try {
      const response = await submitClaim(accessToken, invoiceId, body, key);
      settleAttempt(signature);
      void queryClient.invalidateQueries({ queryKey: ['outlet', outletId, 'credit'] });
      void queryClient.invalidateQueries({ queryKey: ['credit-agreement', agreementId] });
      toast.show(`Sent to ${supplierName}. They will confirm it. Until then, ${formatMoney(response.amount ?? body.amount)} still shows as owed.`, 'success');
      return response;
    } catch (caught) {
      if (isDefinitiveFailure(caught)) settleAttempt(signature);
      const next = classify(caught);
      if (next.kind === 'overpayment' || next.kind === 'state' || next.kind === 'reuse' || !isDefinitiveFailure(caught)) {
        void queryClient.invalidateQueries({ queryKey: ['outlet', outletId, 'credit'] });
        void queryClient.invalidateQueries({ queryKey: ['credit-agreement', agreementId] });
      }
      if (next.kind === 'reuse') void checkBeforeRetry();
      if (next.kind === 'processing') recheckLater();
      if (isMounted()) setError(next);
      return null;
    } finally {
      inFlight.current = false;
      if (isMounted()) setPending(false);
    }
  }, [accessToken, agreementId, outletId, queryClient, supplierName, toast, recovery.checking,
    checkBeforeRetry, recheckLater, isMounted]);

  const reset = useCallback(() => setError(null), []);

  return { send, pending, error, reset, checking: recovery.checking, isMounted };
}
