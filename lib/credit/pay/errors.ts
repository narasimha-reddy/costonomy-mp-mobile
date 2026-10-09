import { ApiError } from '@/lib/api/errors';
import { isKeyReuse, isPreviousAttemptFailed, isStillProcessing } from '@/lib/api/idempotency';
import {
  FLAG_OFF_TEXT, SIGN_IN_AGAIN, START_FAILED_TEXT, WALLET_ON_HOLD_TEXT,
} from '@/lib/credit/pay/copy';

const EARLIER_MAY_HAVE_WORKED =
  "An earlier try may have gone through. We're checking your credit; please look before paying again.";
const STILL_PROCESSING = "Still processing… we'll check again.";
const DIDNT_GO_THROUGH = "That didn't go through. Please try again.";

function numberList(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const ids = value.filter((v): v is number => typeof v === 'number');
  return ids.length === value.length ? ids : null;
}

/** 409 CREDIT_PAY_SELECTION_CHANGED: the invoice ids that moved on; null for any other error. */
export function selectionChangedIds(error: unknown): number[] | null {
  if (!(error instanceof ApiError) || error.code !== 'CREDIT_PAY_SELECTION_CHANGED') return null;
  return numberList(error.details?.changedInvoiceIds) ?? [];
}

/** 422 WALLET_INSUFFICIENT_BALANCE: how much is missing, as the server sent it; null otherwise. */
export function walletShortBy(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.code !== 'WALLET_INSUFFICIENT_BALANCE') return null;
  const v = error.details?.shortBy;
  return typeof v === 'number' || typeof v === 'string' ? String(v) : null;
}

/** A sentence for any error from the pay endpoints. The server's own message when it wrote one for people. */
export function payErrorMessage(caught: unknown): string {
  if (caught instanceof ApiError) {
    if (caught.isUnauthenticated) return SIGN_IN_AGAIN;
    if (caught.code === 'FORBIDDEN') return FLAG_OFF_TEXT;
    if (caught.code === 'WALLET_ON_HOLD') return WALLET_ON_HOLD_TEXT;
    if (isKeyReuse(caught)) return EARLIER_MAY_HAVE_WORKED;
    if (isStillProcessing(caught)) return STILL_PROCESSING;
    if (isPreviousAttemptFailed(caught)) return DIDNT_GO_THROUGH;
    if (caught.message !== '') return caught.message;
  }
  return START_FAILED_TEXT;
}

/** Verify said the payment did not go through (422 PAYMENT_FAILED): the same order can be paid again. */
export function isPaymentDeclined(caught: unknown): boolean {
  return caught instanceof ApiError && caught.code === 'PAYMENT_FAILED';
}
