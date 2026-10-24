import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { ApiError } from '@/lib/api/errors';
import { isDefinitiveFailure, isKeyReuse, isPreviousAttemptFailed, isStillProcessing } from '@/lib/api/idempotency';
import { attemptKey, settleAttempt } from '@/lib/credit/attemptKeys';
import { supplierWriteKeys } from '@/lib/queryKeys';
import { extendInvoiceDue } from '@/services/credit';
import {
  DIDNT_GO_THROUGH_TEXT, EARLIER_MAY_HAVE_WORKED_TEXT, RETRY_TEXT, SIGN_IN_AGAIN_TEXT, STILL_PROCESSING_TEXT,
} from '@/hooks/useDecideClaim';
import type { ExtendDueResponse } from '@/models/credit';
import { formatDay } from '@/utils/dateRange';

const FALLBACK_TEXT = 'Please check the details and try again.';

/**
 * The server's own words win: it names the rule that was broken (not after the current date, or
 * past the 60-day limit) and, when it says so, the latest day that is allowed.
 */
function messageFor(caught: unknown): string {
  if (!(caught instanceof ApiError)) return RETRY_TEXT;
  if (caught.isUnauthenticated) return SIGN_IN_AGAIN_TEXT;
  if (isKeyReuse(caught)) return EARLIER_MAY_HAVE_WORKED_TEXT;
  if (isStillProcessing(caught)) return STILL_PROCESSING_TEXT;
  if (isPreviousAttemptFailed(caught)) return DIDNT_GO_THROUGH_TEXT;
  if (isDefinitiveFailure(caught)) {
    const text = caught.message !== '' ? caught.message : FALLBACK_TEXT;
    const latest = typeof caught.details?.latestDueDate === 'string' ? formatDay(caught.details.latestDueDate) : null;
    return latest != null && !text.includes(latest) ? `${text} The latest you can pick is ${latest}.` : text;
  }
  return RETRY_TEXT;
}

/**
 * Move an invoice's due date later, as the supplier. Same discipline as `useRecordPayment`: the
 * idempotency key is held per (store, invoice, new day, reason) outside the sheet, kept while the
 * outcome is unknown and dropped on a refusal; one request at a time; on success everything the
 * move can change (the invoice, the line, the receivables, the statement) is refetched.
 */
export function useExtendDue(invoiceId: number, agreementId: number) {
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

  const extend = useCallback(async (newDueDate: string, reason: string): Promise<ExtendDueResponse | null> => {
    if (inFlight.current || accessToken == null) return null;
    inFlight.current = true;
    setPending(true);
    setError(null);
    const signature = ['supplier-extend', storeId, invoiceId, newDueDate, reason].join('|');
    const key = attemptKey(signature);
    try {
      const response = await extendInvoiceDue(accessToken, invoiceId, { newDueDate, reason }, key);
      settleAttempt(signature);
      void refresh();
      return response;
    } catch (caught) {
      if (isDefinitiveFailure(caught)) settleAttempt(signature);
      // A refused move (paid, written off) means the screen was out of date: show what is true now.
      if (!isDefinitiveFailure(caught) || isKeyReuse(caught)
        || (caught instanceof ApiError && (caught.status === 409 || caught.status === 404))) {
        void refresh();
      }
      if (isStillProcessing(caught)) {
        if (timer.current != null) clearTimeout(timer.current);
        timer.current = setTimeout(() => { timer.current = null; void refresh(); }, 4000);
      }
      if (mounted.current) setError(messageFor(caught));
      return null;
    } finally {
      inFlight.current = false;
      if (mounted.current) setPending(false);
    }
  }, [accessToken, storeId, invoiceId, refresh]);

  const reset = useCallback(() => setError(null), []);
  return { extend, pending, error, reset };
}
