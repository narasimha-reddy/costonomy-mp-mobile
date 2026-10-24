import { ApiError } from '@/lib/api/errors';
import { dayMonth, istDayMonth } from '@/lib/credit/istFormat';
import { formatMoney } from '@/utils/money';
import type { StorePayment } from '@/models/credit';

/** The usual reasons, one tap each. "Other" leaves the box for the person to fill. */
export const QUICK_REASONS = ['Typed the wrong amount', 'Wrong restaurant', 'Cheque bounced', 'Other'] as const;

export const NO_PERMISSION_TEXT = "You don't have permission to undo payments for this store.";
export const GONE_TEXT = 'This payment is no longer available. Go back and refresh.';
export const FALLBACK_TEXT = 'Please check the details and try again.';
export const MAY_HAVE_WORKED_TEXT =
  'Your earlier try may have gone through. We have refreshed this page: please check before trying again.';
export const RETRY_TEXT = "That didn't go through. Please try again.";

/**
 * Whether a payment row offers Undo. The server decides `reversible` (right source, inside
 * the window, not already reversed); the app only adds the permission and never works out the
 * window itself.
 */
export function mayUndo(
  payment: Pick<StorePayment, 'reversible' | 'reversedAt'>, permitted: boolean,
): boolean {
  return permitted && payment.reversible === true && payment.reversedAt == null;
}

/** "Undo until 12th Oct", from the server's last day. Null when there is none. */
export function undoUntilText(reversibleUntil: string | null | undefined): string | null {
  const day = dayMonth(reversibleUntil);
  return day == null ? null : `Undo until ${day}`;
}

/** "Cancelled on 5th Oct", the India day it was undone. */
export function cancelledOnText(reversedAt: string | null | undefined): string | null {
  const day = istDayMonth(reversedAt);
  return day == null ? null : `Cancelled on ${day}`;
}

function detailText(caught: ApiError, key: string): string | null {
  const v = caught.details?.[key];
  return typeof v === 'string' || typeof v === 'number' ? String(v) : null;
}

/** What an undo's failure says, in plain words and never a raw code. Server numbers are formatted, not worked out. */
export function reversalErrorText(caught: unknown): string {
  if (!(caught instanceof ApiError)) return RETRY_TEXT;
  switch (caught.code) {
    case 'CREDIT_REVERSAL_NOT_ALLOWED':
      return "This payment can't be undone here. It may be from the wallet, on a written-off invoice, or part of a bigger payment.";
    case 'CREDIT_REVERSAL_WINDOW_CLOSED': {
      const until = dayMonth(detailText(caught, 'reversibleUntil'));
      return until == null
        ? 'It is too late to undo this payment.'
        : `It is too late to undo this payment. It could be undone until ${until}.`;
    }
    case 'CREDIT_ALREADY_REVERSED':
      return 'This payment was already cancelled.';
    case 'CREDIT_REVERSAL_NO_HEADROOM': {
      const short = detailText(caught, 'shortBy');
      return short == null || Number.isNaN(Number(short))
        ? (caught.message !== '' ? caught.message : FALLBACK_TEXT)
        : `Raise their limit by ${formatMoney(short)} first, or suspend the line.`;
    }
    case 'IDEMPOTENCY_KEY_REUSE':
      return MAY_HAVE_WORKED_TEXT;
    default:
      break;
  }
  if (caught.status === 403) return NO_PERMISSION_TEXT;
  if (caught.status === 404) return GONE_TEXT;
  if (caught.status >= 400 && caught.status < 500) return caught.message !== '' ? caught.message : FALLBACK_TEXT;
  return RETRY_TEXT;
}
