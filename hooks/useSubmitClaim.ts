import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { useToast } from '@/components/common';
import { ApiError } from '@/lib/api/errors';
import { isDefinitiveFailure } from '@/lib/api/idempotency';
import { useIdempotencyKey } from '@/hooks/useIdempotencyKey';
import { isClaimStateError, isOverpaymentError, submitClaim } from '@/services/credit';
import { formatMoney } from '@/utils/money';
import type { ClaimResponse, SubmitClaimRequest } from '@/models/credit';

/** What went wrong, in the terms the form words. Never a raw code. */
export type ClaimError =
  | { kind: 'overpayment'; outstanding: number }
  | { kind: 'state' }
  | { kind: 'invalid'; message: string }
  | { kind: 'retry' };

function classify(caught: unknown): ClaimError {
  const over = isOverpaymentError(caught);
  if (over != null) return { kind: 'overpayment', ...over };
  if (isClaimStateError(caught)) return { kind: 'state' };
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
 * <p><b>The idempotency key belongs to one attempt.</b> It is made once per
 * distinct (invoice, amount, method, reference, day) and sent again on a retry
 * whose outcome is unknown (a 5xx, a dropped connection), so a double tap or a
 * retry can never file the same report twice. Changing any of those is a
 * different attempt and gets a new key; success or a refusal ends the attempt.
 *
 * <p>The success toast is shown only once the server has answered. Nothing that
 * is owed changes until the supplier confirms; this only refreshes the screens.
 */
export function useSubmitClaim(target: { agreementId: number; supplierName: string }) {
  const { accessToken } = useSession();
  const { outletId } = useOutlet();
  const queryClient = useQueryClient();
  const toast = useToast();
  const idempotency = useIdempotencyKey();
  const keyedFor = useRef<string | null>(null);
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ClaimError | null>(null);

  const { agreementId, supplierName } = target;

  const send = useCallback(async (
    invoiceId: number,
    body: SubmitClaimRequest,
  ): Promise<ClaimResponse | null> => {
    if (inFlight.current || accessToken == null) return null;
    inFlight.current = true;
    setPending(true);
    setError(null);

    const signature = [invoiceId, body.amount, body.method, body.reference ?? '', body.paidOn].join('|');
    if (keyedFor.current !== signature) idempotency.settle();
    keyedFor.current = signature;
    const key = idempotency.key();

    try {
      const response = await submitClaim(accessToken, invoiceId, body, key);
      idempotency.settle();
      keyedFor.current = null;
      void queryClient.invalidateQueries({ queryKey: ['outlet', outletId, 'credit'] });
      void queryClient.invalidateQueries({ queryKey: ['credit-agreement', agreementId] });
      toast.show(`Sent to ${supplierName}. They will confirm it. Until then, ${formatMoney(response.amount ?? body.amount)} still shows as owed.`, 'success');
      return response;
    } catch (caught) {
      idempotency.settle(caught);
      const next = classify(caught);
      if (next.kind === 'overpayment' || next.kind === 'state') {
        void queryClient.invalidateQueries({ queryKey: ['outlet', outletId, 'credit'] });
        void queryClient.invalidateQueries({ queryKey: ['credit-agreement', agreementId] });
      }
      setError(next);
      return null;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }, [accessToken, agreementId, outletId, queryClient, supplierName, toast, idempotency]);

  const reset = useCallback(() => setError(null), []);

  return { send, pending, error, reset };
}
