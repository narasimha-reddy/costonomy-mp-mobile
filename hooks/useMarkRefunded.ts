import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { ApiError } from '@/lib/api/errors';
import { refundErrorText } from '@/lib/credit/creditNotes';
import { markRefundDue } from '@/services/credit';
import type { RefundDue } from '@/models/credit';

/**
 * The supplier marks a refund due as refunded. No money moves and the server answers 200 for one
 * already marked, so there is no key; one request at a time guards the double tap. The refunds
 * list is refetched after any answer from the server.
 */
export function useMarkRefunded() {
  const { accessToken } = useSession();
  const { storeId } = useStore();
  const queryClient = useQueryClient();
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const mark = useCallback(async (refundId: number, note?: string): Promise<RefundDue | null> => {
    if (inFlight.current || accessToken == null) return null;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const response = await markRefundDue(accessToken, refundId, note);
      void queryClient.invalidateQueries({ queryKey: ['store', storeId, 'credit-refunds'] });
      return response;
    } catch (caught) {
      if (caught instanceof ApiError) void queryClient.invalidateQueries({ queryKey: ['store', storeId, 'credit-refunds'] });
      if (mounted.current) setError(refundErrorText(caught));
      return null;
    } finally {
      inFlight.current = false;
      if (mounted.current) setPending(false);
    }
  }, [accessToken, storeId, queryClient]);

  const reset = useCallback(() => setError(null), []);
  return { mark, pending, error, reset };
}
