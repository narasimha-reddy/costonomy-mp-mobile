import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { ApiError } from '@/lib/api/errors';
import { isKeyReuse, isPreviousAttemptFailed, isStillProcessing } from '@/lib/api/idempotency';
import { attemptKey, settleAttempt } from '@/lib/credit/attemptKeys';
import { reminderErrorText } from '@/lib/credit/remind';
import { supplierWriteKeys } from '@/lib/queryKeys';
import { sendReminder } from '@/services/credit';
import { DIDNT_GO_THROUGH_TEXT, SIGN_IN_AGAIN_TEXT, STILL_PROCESSING_TEXT } from '@/hooks/useDecideClaim';
import type { Reminder } from '@/models/credit';

const RECHECK_MS = 4000;

/** An answer from the server (including a 429 throttle) ends the attempt; only silence keeps the key. */
function answered(caught: unknown): boolean {
  return caught instanceof ApiError && caught.status < 500 && !isStillProcessing(caught);
}

function words(caught: unknown): string {
  if (caught instanceof ApiError) {
    if (caught.isUnauthenticated) return SIGN_IN_AGAIN_TEXT;
    if (isStillProcessing(caught)) return STILL_PROCESSING_TEXT;
    if (isPreviousAttemptFailed(caught)) return DIDNT_GO_THROUGH_TEXT;
  }
  return reminderErrorText(caught);
}

/**
 * The supplier sends a payment reminder, store-scoped.
 *
 * <p>The idempotency key belongs to one attempt (store, line, invoices, note) and is sent again
 * after a dropped connection or a 5xx, so a retry reaches one reminder. Any answer from the
 * server, a 429 throttle included, spends the key, so the next try gets a new one. One request
 * at a time. After a send, a refusal or an unknown outcome the line and its reminder list are
 * refetched.
 */
export function useSendReminder(agreementId: number) {
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

  const send = useCallback(async (
    body: { invoiceIds?: number[]; note?: string },
  ): Promise<Reminder | null> => {
    if (inFlight.current || accessToken == null) return null;
    inFlight.current = true;
    setPending(true);
    setError(null);
    const signature = [
      'supplier-remind', storeId, agreementId, [...(body.invoiceIds ?? [])].sort((a, b) => a - b).join(','),
      body.note ?? '',
    ].join('|');
    const key = attemptKey(signature);
    try {
      const response = await sendReminder(accessToken, agreementId, body, key);
      settleAttempt(signature);
      void refresh();
      return response;
    } catch (caught) {
      if (answered(caught)) settleAttempt(signature);
      // The screen's view of what is due may be stale, or the first try may have worked.
      if (!(caught instanceof ApiError) || caught.status !== 400 || isKeyReuse(caught)) void refresh();
      if (isStillProcessing(caught)) {
        if (timer.current != null) clearTimeout(timer.current);
        timer.current = setTimeout(() => { timer.current = null; void refresh(); }, RECHECK_MS);
      }
      if (mounted.current) setError(words(caught));
      return null;
    } finally {
      inFlight.current = false;
      if (mounted.current) setPending(false);
    }
  }, [accessToken, storeId, agreementId, refresh]);

  const reset = useCallback(() => setError(null), []);

  return { send, pending, error, reset };
}
