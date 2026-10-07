import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { ApiError } from '@/lib/api/errors';
import { isDefinitiveFailure, isKeyReuse, isPreviousAttemptFailed, isStillProcessing } from '@/lib/api/idempotency';
import { attemptKey, settleAttempt } from '@/lib/credit/attemptKeys';
import { reversalErrorText } from '@/lib/credit/reversal';
import { supplierWriteKeys } from '@/lib/queryKeys';
import { reversePayment, reverseReceipt } from '@/services/credit';
import { DIDNT_GO_THROUGH_TEXT, SIGN_IN_AGAIN_TEXT, STILL_PROCESSING_TEXT } from '@/hooks/useDecideClaim';
import type { ReversalResult } from '@/models/credit';

const RECHECK_MS = 4000;

/** What an undo can be asked about: the receipt when the payment has one, else the payment itself. */
export interface UndoTarget {
  receiptId: number | null | undefined;
  paymentId: number;
}

function classify(caught: unknown): { kind: 'refused' | 'unknown'; text: string } {
  if (caught instanceof ApiError) {
    if (caught.isUnauthenticated) return { kind: 'refused', text: SIGN_IN_AGAIN_TEXT };
    if (isStillProcessing(caught)) return { kind: 'unknown', text: STILL_PROCESSING_TEXT };
    if (isPreviousAttemptFailed(caught)) return { kind: 'refused', text: DIDNT_GO_THROUGH_TEXT };
    if (isDefinitiveFailure(caught)) return { kind: 'refused', text: reversalErrorText(caught) };
  }
  return { kind: 'unknown', text: reversalErrorText(caught) };
}

/**
 * The supplier undoes a payment they recorded, store-scoped.
 *
 * <p><b>The idempotency key belongs to one attempt.</b> It is made once per (store, target,
 * reason) in `lib/credit/attemptKeys` and sent again after a dropped connection or a 5xx, so a
 * retry reaches one reversal. A server refusal consumes its key, so the next attempt gets a
 * fresh one. The receipt endpoint is used when the payment has a receipt (the whole receipt is
 * undone), else the payment's own.
 *
 * <p>One request at a time (`inFlight`). The line's receivables, invoices, payments,
 * statements and claims are refetched after success, after a 409, and after an unknown outcome.
 */
export function useReversePayment(agreementId: number) {
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

  const refresh = useCallback(() => Promise.all(
    supplierWriteKeys(storeId, agreementId).map((queryKey) =>
      queryClient.invalidateQueries({ queryKey: [...queryKey] })),
  ), [queryClient, storeId, agreementId]);

  const reverse = useCallback(async (target: UndoTarget, reason: string): Promise<ReversalResult | null> => {
    if (inFlight.current || accessToken == null) return null;
    inFlight.current = true;
    setPending(true);
    setError(null);
    const useReceipt = target.receiptId != null;
    const subject = useReceipt ? `receipt-${target.receiptId}` : `payment-${target.paymentId}`;
    const signature = ['supplier-reverse', storeId, subject, reason].join('|');
    const key = attemptKey(signature);
    try {
      const response = useReceipt
        ? await reverseReceipt(accessToken, target.receiptId as number, reason, key)
        : await reversePayment(accessToken, target.paymentId, reason, key);
      settleAttempt(signature);
      void refresh();
      return response;
    } catch (caught) {
      // A refusal ends the attempt (the server marks its key spent): the next try gets a new key.
      if (isDefinitiveFailure(caught)) settleAttempt(signature);
      if (!isDefinitiveFailure(caught) || isKeyReuse(caught)
        || (caught instanceof ApiError && (caught.status === 404 || caught.status === 409))) {
        void refresh();
      }
      if (isStillProcessing(caught)) {
        if (timer.current != null) clearTimeout(timer.current);
        timer.current = setTimeout(() => { timer.current = null; void refresh(); }, RECHECK_MS);
      }
      if (mounted.current) setError(classify(caught).text);
      return null;
    } finally {
      inFlight.current = false;
      if (mounted.current) setPending(false);
    }
  }, [accessToken, storeId, refresh]);

  const reset = useCallback(() => setError(null), []);

  return { reverse, pending, error, reset };
}
