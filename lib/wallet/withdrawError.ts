import { ApiError } from '@/lib/api/errors';
import type { WithdrawalRefusalReason } from '@/models/wallet';

export const PAUSED_FALLBACK =
  'Withdrawals are paused for a short while. Your money is safe in your wallet.';

/** What the wallet screen shows for a failed withdrawal (API D-110). */
export type WithdrawFailure =
  /**
   * 422: more than can go back. `withdrawableNow` is the server's own figure in
   * rupees, or null when it is missing, unreadable or zero (no offer then).
   */
  | { kind: 'EXCEEDS_REFUNDABLE'; message: string; withdrawableNow: string | null;
      reason: WithdrawalRefusalReason | null }
  /** 503: nothing was debited and it is not a failed attempt: the same key is kept. */
  | { kind: 'PAUSED'; message: string }
  /** Anything else, with the server's own sentence when it sent one. */
  | { kind: 'OTHER'; message: string };

const REASONS: readonly string[] = ['SOURCE_BLOCKED', 'PROVIDER_UNREACHABLE', 'NO_REFUND_MONEY'];

/**
 * A rupee amount the server sent, as the string a request carries. A number is
 * written with two decimals (formatting, not arithmetic); a string must already
 * be a plain amount. Anything else, zero and negatives included, is null.
 */
export function offeredAmount(raw: unknown): string | null {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0) return null;
    return raw.toFixed(2);
  }
  if (typeof raw === 'string' && /^\d{1,13}(\.\d{1,4})?$/.test(raw.trim())) {
    const text = raw.trim();
    return Number(text) > 0 ? text : null;
  }
  return null;
}

export function withdrawFailure(caught: unknown): WithdrawFailure {
  const fallback = 'Could not send that. Try again.';
  if (!(caught instanceof ApiError)) return { kind: 'OTHER', message: fallback };
  const message = caught.message?.trim() ? caught.message : fallback;

  if (caught.code === 'WITHDRAWAL_EXCEEDS_REFUNDABLE') {
    const details = caught.details;
    const reason = typeof details?.reason === 'string' && REASONS.includes(details.reason)
      ? (details.reason as WithdrawalRefusalReason) : null;
    return { kind: 'EXCEEDS_REFUNDABLE', message, withdrawableNow: offeredAmount(details?.withdrawableNow), reason };
  }
  if (caught.code === 'WITHDRAWALS_PAUSED') {
    return { kind: 'PAUSED', message: caught.message?.trim() ? caught.message : PAUSED_FALLBACK };
  }
  return { kind: 'OTHER', message };
}
