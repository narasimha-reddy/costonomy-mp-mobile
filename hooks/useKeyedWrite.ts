import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { ApiError } from '@/lib/api/errors';
import { isDefinitiveFailure, isKeyReuse, isPreviousAttemptFailed, isStillProcessing } from '@/lib/api/idempotency';
import { attemptKey, settleAttempt } from '@/lib/credit/attemptKeys';
import { supplierWriteKeys } from '@/lib/queryKeys';
import { DIDNT_GO_THROUGH_TEXT, SIGN_IN_AGAIN_TEXT, STILL_PROCESSING_TEXT } from '@/hooks/useDecideClaim';

const RECHECK_MS = 4000;

/**
 * One supplier write that moves debt and takes an idempotency key, with the key discipline of
 * `useReversePayment`: the key belongs to one attempt (its `signature`) and is sent again after a
 * dropped connection or a 5xx, so a retry reaches one operation. A server refusal spends the key,
 * so the next try gets a fresh one. One request at a time. The store's credit queries are refetched
 * after success, after a 404/409/key-reuse and after an unknown outcome.
 */
export function useKeyedWrite<Args, Result>(
  agreementId: number | null,
  config: {
    signature: (args: Args, storeId: number | null | undefined) => string;
    call: (token: string, args: Args, key: string) => Promise<Result>;
    errorText: (caught: unknown) => string;
  },
) {
  const { accessToken } = useSession();
  const { storeId } = useStore();
  const queryClient = useQueryClient();
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const configRef = useRef(config);
  configRef.current = config;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

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

  const run = useCallback(async (args: Args): Promise<Result | null> => {
    if (inFlight.current || accessToken == null) return null;
    inFlight.current = true;
    setPending(true);
    setError(null);
    const { signature: sign, call, errorText } = configRef.current;
    const signature = sign(args, storeId);
    const key = attemptKey(signature);
    try {
      const response = await call(accessToken, args, key);
      settleAttempt(signature);
      void refresh();
      if (mounted.current) setResult(response);
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
      let text = errorText(caught);
      if (caught instanceof ApiError) {
        if (caught.isUnauthenticated) text = SIGN_IN_AGAIN_TEXT;
        else if (isStillProcessing(caught)) text = STILL_PROCESSING_TEXT;
        else if (isPreviousAttemptFailed(caught)) text = DIDNT_GO_THROUGH_TEXT;
      }
      if (mounted.current) setError(text);
      return null;
    } finally {
      inFlight.current = false;
      if (mounted.current) setPending(false);
    }
  }, [accessToken, storeId, refresh]);

  const reset = useCallback(() => setError(null), []);

  return { run, pending, error, result, reset };
}
