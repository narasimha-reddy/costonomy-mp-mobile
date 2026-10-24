import { newIdempotencyKey } from '@/lib/api/client';

/**
 * Idempotency keys for money attempts, held OUTSIDE any sheet or screen.
 *
 * <p>A sheet that closes after an unknown outcome (a dropped connection, a 5xx)
 * must not lose the key: reopening it and paying the same amount again has to
 * reach the same server operation, never start a second debit. So the key lives
 * here, in a module-level store keyed by the whole attempt (outlet, supplier,
 * amount, invoice...), and is dropped only when
 * <ul>
 *   <li>the attempt reached a definitive outcome (success, or a refusal), via
 *       {@link settleAttempt}; or</li>
 *   <li>the attempt is used again after the state it was made against changed
 *       (a different `stamp`, e.g. the supplier's due now differs after a
 *       refetch): then the person is looking at a new situation and a new key
 *       is right; or</li>
 *   <li>it is older than {@link MAX_AGE_MS}.</li>
 * </ul>
 */
const MAX_AGE_MS = 30 * 60 * 1000;

interface Entry { key: string; stamp: string; at: number }
const entries = new Map<string, Entry>();

/** The key for this attempt: the same one while it is undecided, a new one otherwise. */
export function attemptKey(signature: string, stamp = ''): string {
  const now = Date.now();
  const held = entries.get(signature);
  if (held != null && held.stamp === stamp && now - held.at < MAX_AGE_MS) return held.key;
  const entry = { key: newIdempotencyKey(), stamp, at: now };
  entries.set(signature, entry);
  return entry.key;
}

/** The attempt reached a definitive outcome: its key is spent. */
export function settleAttempt(signature: string): void {
  entries.delete(signature);
}

/** Whether an undecided attempt is held for this signature (tests, diagnostics). */
export function hasAttempt(signature: string): boolean {
  return entries.has(signature);
}

/** Forget everything. For tests and sign-out. */
export function resetAttemptKeys(): void {
  entries.clear();
}
