import { ApiError } from '@/lib/api/errors';

/** The server's answers about an idempotency key, by code. */
export const KEY_REUSE = 'IDEMPOTENCY_KEY_REUSE';
export const REQUEST_IN_PROGRESS = 'IDEMPOTENT_REQUEST_IN_PROGRESS';
export const PREVIOUS_ATTEMPT_FAILED = 'IDEMPOTENT_PREVIOUS_ATTEMPT_FAILED';

function hasCode(caught: unknown, code: string): boolean {
  return caught instanceof ApiError && caught.code === code;
}

/** The same key reached the server with a different payload: an earlier try with it may have worked. */
export function isKeyReuse(caught: unknown): boolean {
  return hasCode(caught, KEY_REUSE);
}

/** The key is still being handled: keep it and ask again later. */
export function isStillProcessing(caught: unknown): boolean {
  return hasCode(caught, REQUEST_IN_PROGRESS);
}

/** The earlier try with this key failed for good: the next try needs a new key. */
export function isPreviousAttemptFailed(caught: unknown): boolean {
  return hasCode(caught, PREVIOUS_ATTEMPT_FAILED);
}

/**
 * Whether a failed mutation's outcome is known, so its idempotency key can be
 * dropped and the next attempt given a new one.
 *
 * <p>A refusal (4xx) is known: nothing happened, and the server has marked that
 * key failed, so `IDEMPOTENT_PREVIOUS_ATTEMPT_FAILED` is definitive too. Everything
 * else is unknown and keeps the key, so a retry reaches the same operation rather
 * than starting a second: a 5xx or a network failure may have done the work,
 * "still in progress" is this very key being handled, and a rate limit means
 * later, not differently (D-102).
 *
 * <p>`IDEMPOTENCY_KEY_REUSE` is definitive for the KEY (it cannot be used again),
 * but it is not proof that nothing was done: callers must refresh and tell the
 * person before allowing another attempt (see `isKeyReuse`).
 */
export function isDefinitiveFailure(caught: unknown): boolean {
  return caught instanceof ApiError
    && caught.status < 500
    && caught.status !== 429
    && caught.code !== REQUEST_IN_PROGRESS;
}
