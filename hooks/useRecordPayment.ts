import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { ApiError } from '@/lib/api/errors';
import { isDefinitiveFailure, isKeyReuse, isPreviousAttemptFailed, isStillProcessing } from '@/lib/api/idempotency';
import { attemptKey, settleAttempt } from '@/lib/credit/attemptKeys';
import { supplierWriteKeys } from '@/lib/queryKeys';
import { isDuplicateReference, recordSupplierPayment } from '@/services/credit';
import {
  DIDNT_GO_THROUGH_TEXT, EARLIER_MAY_HAVE_WORKED_TEXT, RETRY_TEXT, SIGN_IN_AGAIN_TEXT, STILL_PROCESSING_TEXT,
} from '@/hooks/useDecideClaim';
import type { RecordPaymentBody, RecordedPayment } from '@/models/credit';

const FALLBACK_TEXT = 'Please check the details and try again.';
const NOT_AVAILABLE_TEXT = 'This credit line or one of the invoices is no longer available. Go back and refresh.';
const NO_PERMISSION_TEXT = "You don't have permission to record payments for this store.";
const RECHECK_MS = 4000;

/** What went wrong, in the terms the sheet words. Never a raw code. */
export type RecordError =
  /** The reference was recorded before: the sheet offers "Record anyway" (same key, flag set). */
  | { kind: 'duplicate'; text: string; paidOn: string | null; amount: string | null }
  /** A refusal or an unknown outcome; `text` is what to say. */
  | { kind: 'refused' | 'unknown'; text: string };

function classify(caught: unknown): RecordError {
  const duplicate = isDuplicateReference(caught);
  if (duplicate != null) {
    return {
      kind: 'duplicate',
      text: (caught as ApiError).message !== '' ? (caught as ApiError).message
        : 'That reference was already recorded.',
      ...duplicate,
    };
  }
  if (caught instanceof ApiError) {
    if (caught.isUnauthenticated) return { kind: 'refused', text: SIGN_IN_AGAIN_TEXT };
    if (isKeyReuse(caught)) return { kind: 'refused', text: EARLIER_MAY_HAVE_WORKED_TEXT };
    if (isStillProcessing(caught)) return { kind: 'unknown', text: STILL_PROCESSING_TEXT };
    if (isPreviousAttemptFailed(caught)) return { kind: 'refused', text: DIDNT_GO_THROUGH_TEXT };
    if (caught.status === 403) return { kind: 'refused', text: NO_PERMISSION_TEXT };
    if (caught.status === 404) return { kind: 'refused', text: NOT_AVAILABLE_TEXT };
    if (isDefinitiveFailure(caught)) {
      return { kind: 'refused', text: caught.message !== '' ? caught.message : FALLBACK_TEXT };
    }
  }
  return { kind: 'unknown', text: RETRY_TEXT };
}

/**
 * The supplier records money received on a line, store-scoped.
 *
 * <p><b>The idempotency key belongs to one attempt and outlives the sheet.</b> It is made once per
 * distinct (store, line, amount, method, reference, day, note, invoices) in `lib/credit/attemptKeys`
 * and sent again on a retry whose outcome is unknown (a 5xx, a dropped connection), so a double tap
 * or a retry reaches one receipt. A refusal ends the attempt, so the next try gets a new key, and
 * so does `IDEMPOTENT_PREVIOUS_ATTEMPT_FAILED`.
 *
 * <p>The one refusal that keeps its key is a duplicate reference: "Record anyway" sends the same
 * body with `allowDuplicateReference` and the SAME key (the server checks the reference before it
 * claims the key, so the key is still free). The flag is not part of the attempt's signature.
 *
 * <p>One request at a time (`inFlight`). On success the store's receivables, lists, the line, its
 * invoices, payments, claims and statements are refetched.
 */
export function useRecordPayment(agreementId: number) {
  const { accessToken } = useSession();
  const { storeId } = useStore();
  const queryClient = useQueryClient();
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<RecordError | null>(null);
  const [result, setResult] = useState<RecordedPayment | null>(null);

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

  const record = useCallback(async (
    body: RecordPaymentBody,
    allowDuplicate = false,
  ): Promise<RecordedPayment | null> => {
    if (inFlight.current || accessToken == null) return null;
    inFlight.current = true;
    setPending(true);
    setError(null);
    const signature = [
      'supplier-record', storeId, agreementId, body.amount, body.method, body.reference ?? '', body.paidOn,
      body.note ?? '', (body.invoiceIds ?? []).join(','),
    ].join('|');
    const key = attemptKey(signature);
    try {
      const response = await recordSupplierPayment(
        accessToken, agreementId, allowDuplicate ? { ...body, allowDuplicateReference: true } : body, key);
      settleAttempt(signature);
      void refresh();
      if (mounted.current) setResult(response);
      return response;
    } catch (caught) {
      const next = classify(caught);
      // A duplicate reference is a question, not an outcome: the key stays for "Record anyway".
      if (next.kind !== 'duplicate' && isDefinitiveFailure(caught)) settleAttempt(signature);
      if (!isDefinitiveFailure(caught) || isKeyReuse(caught)
        || (caught instanceof ApiError && (caught.status === 404 || caught.code === 'CREDIT_OVERPAYMENT'))) {
        void refresh();
      }
      if (isStillProcessing(caught)) {
        if (timer.current != null) clearTimeout(timer.current);
        timer.current = setTimeout(() => { timer.current = null; void refresh(); }, RECHECK_MS);
      }
      if (mounted.current) setError(next);
      return null;
    } finally {
      inFlight.current = false;
      if (mounted.current) setPending(false);
    }
  }, [accessToken, agreementId, storeId, refresh]);

  const reset = useCallback(() => setError(null), []);

  return { record, pending, error, result, reset };
}
