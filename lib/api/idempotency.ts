import { ApiError } from '@/lib/api/errors';

/**
 * Whether a failed mutation's outcome is known, so its idempotency key can be
 * dropped and the next attempt given a new one.
 *
 * <p>A refusal (4xx) is known: nothing happened, and the server has marked that
 * key failed — sending it again is answered "the previous attempt failed", never
 * with a fresh try. Everything else is unknown and keeps the key, so a retry
 * reaches the same operation rather than starting a second: a 5xx or a network
 * failure may have done the work, "still in progress" is this very key being
 * handled, and a rate limit means later, not differently (D-102).
 */
export function isDefinitiveFailure(caught: unknown): boolean {
  return caught instanceof ApiError
    && caught.status < 500
    && caught.status !== 429
    && caught.code !== 'IDEMPOTENT_REQUEST_IN_PROGRESS';
}
