import { useCallback, useRef } from 'react';
import { newIdempotencyKey } from '@/lib/api/client';
import { isDefinitiveFailure } from '@/lib/api/idempotency';

/**
 * One key per attempt at one mutation: the same across retries of an attempt
 * whose outcome is unknown, a new one once it succeeded or was refused.
 *
 * <p>Call `key()` when sending and `settle(error?)` when it returns — with no
 * argument on success.
 */
export function useIdempotencyKey() {
  const current = useRef<string | null>(null);

  const key = useCallback(() => {
    if (current.current == null) current.current = newIdempotencyKey();
    return current.current;
  }, []);

  const settle = useCallback((caught?: unknown) => {
    if (caught === undefined || isDefinitiveFailure(caught)) current.current = null;
  }, []);

  return { key, settle };
}
