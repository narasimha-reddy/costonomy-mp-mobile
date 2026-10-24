import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { useToast } from '@/components/common';
import { ApiError } from '@/lib/api/errors';
import { walletKey } from '@/lib/queryKeys';
import {
  DIDNT_GO_THROUGH_TEXT,
  EARLIER_MAY_HAVE_WORKED_TEXT,
  STILL_PROCESSING_TEXT,
  useAttemptRecovery,
} from '@/hooks/useAttemptRecovery';
import { isDefinitiveFailure, isKeyReuse, isPreviousAttemptFailed, isStillProcessing } from '@/lib/api/idempotency';
import { attemptKey, settleAttempt } from '@/lib/credit/attemptKeys';
import { isOverpaymentError, isShortBalanceError, repayFromWallet } from '@/services/credit';
import type { WalletRepayment } from '@/models/credit';
import { formatMoney } from '@/utils/money';

/** What went wrong, in the terms the sheet words. Never a raw code. */
export type PayError =
  | { kind: 'short'; shortBy: number; balance: number }
  | { kind: 'overpayment'; outstanding: number }
  | { kind: 'forbidden' }
  /** The wallet is on hold (WALLET_ON_HOLD): not the same as the feature being off. */
  | { kind: 'hold' }
  /** The same key was used with a different payload: the earlier try may have worked. */
  | { kind: 'reuse' }
  /** The server is still handling this very attempt. */
  | { kind: 'processing' }
  /** The session ended (401 after a renewal): the person signs in again; nothing typed is lost. */
  | { kind: 'auth' }
  /** The earlier try with this key failed for good; a new try is a new attempt. */
  | { kind: 'failed' }
  | { kind: 'other'; message: string };

/** The words for the three idempotency outcomes, shared by every pay surface. */
export const SIGN_IN_AGAIN_TEXT = 'Please sign in again.';

export function idempotencyText(kind: 'reuse' | 'processing' | 'failed'): string {
  return kind === 'reuse' ? EARLIER_MAY_HAVE_WORKED_TEXT
    : kind === 'processing' ? STILL_PROCESSING_TEXT : DIDNT_GO_THROUGH_TEXT;
}

export interface PayTarget {
  agreementId: number;
  supplierName: string;
  /** Set when paying one invoice from its own screen. */
  invoiceId?: number;
  /**
   * A fingerprint of the figures the person is looking at (e.g. the due). An
   * attempt held across a closed sheet is only reused while it is unchanged.
   */
  stamp?: string;
}

export function classifyPayError(caught: unknown): PayError {
  const short = isShortBalanceError(caught);
  if (short != null) return { kind: 'short', ...short };
  const over = isOverpaymentError(caught);
  if (over != null) return { kind: 'overpayment', ...over };
  if (caught instanceof ApiError && caught.isUnauthenticated) return { kind: 'auth' };
  if (caught instanceof ApiError && caught.code === 'WALLET_ON_HOLD') return { kind: 'hold' };
  if (caught instanceof ApiError && caught.code === 'FORBIDDEN') return { kind: 'forbidden' };
  if (isKeyReuse(caught)) return { kind: 'reuse' };
  if (isStillProcessing(caught)) return { kind: 'processing' };
  if (isPreviousAttemptFailed(caught)) return { kind: 'failed' };
  const message = caught instanceof Error && caught.message !== ''
    ? caught.message : 'Something went wrong. Please try again.';
  return { kind: 'other', message };
}

/**
 * Repay a credit agreement from the wallet.
 *
 * <p><b>The idempotency key belongs to one attempt, and outlives the sheet.</b> It
 * is made once per distinct (outlet, agreement, amount, invoice) and sent again on
 * a retry whose outcome is unknown (a 5xx, a dropped connection), even after the
 * sheet was closed and reopened (the key is held in `lib/credit/attemptKeys`), so
 * a double tap or a retry can never debit the wallet twice. A different amount is
 * a different attempt and gets a new key; a success or a refusal ends the attempt.
 *
 * <p>`IDEMPOTENCY_KEY_REUSE` never silently allows a new debit: the balance is
 * refreshed first and `checking` stays true until that is done.
 *
 * <p>The success toast is shown only once the server has answered. The server
 * allocates the amount across invoices; nothing is worked out here.
 *
 * @param amount the amount to send, as a decimal string of at most 2 places.
 */
export function usePayFromWallet(target: PayTarget) {
  const { accessToken } = useSession();
  const { outletId } = useOutlet();
  const queryClient = useQueryClient();
  const toast = useToast();
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PayError | null>(null);

  const { agreementId, supplierName, invoiceId, stamp } = target;
  const recovery = useAttemptRecovery([agreementId]);
  const { isMounted, checkBeforeRetry, recheckLater } = recovery;

  const pay = useCallback(async (amount: string): Promise<WalletRepayment | null> => {
    if (inFlight.current || recovery.checking || accessToken == null) return null;
    inFlight.current = true;
    setPending(true);
    setError(null);

    const signature = `pay|${outletId}|${agreementId}|${amount}|${invoiceId ?? ''}`;
    const key = attemptKey(signature, stamp);

    try {
      const response = await repayFromWallet(
        accessToken,
        agreementId,
        invoiceId == null
          ? { amount: Number(amount) }
          : { amount: Number(amount), invoiceIds: [invoiceId] },
        key,
      );
      settleAttempt(signature);
      // Refresh in the background: the answer is already in hand.
      void queryClient.invalidateQueries({ queryKey: walletKey(outletId) });
      void queryClient.invalidateQueries({ queryKey: ['outlet', outletId, 'credit'] });
      void queryClient.invalidateQueries({ queryKey: ['credit-agreement', agreementId] });
      toast.show(`Paid ${formatMoney(response.amount)} to ${supplierName}`, 'success');
      return response;
    } catch (caught) {
      if (isDefinitiveFailure(caught)) settleAttempt(signature);
      const next = classifyPayError(caught);
      // Anything that may have moved money, or says the screens are stale, is
      // re-read now: the unknown outcomes included, so the truth shows up.
      if (next.kind === 'overpayment' || next.kind === 'reuse' || !isDefinitiveFailure(caught)) {
        void queryClient.invalidateQueries({ queryKey: walletKey(outletId) });
        void queryClient.invalidateQueries({ queryKey: ['outlet', outletId, 'credit'] });
        void queryClient.invalidateQueries({ queryKey: ['credit-agreement', agreementId] });
      }
      if (next.kind === 'reuse') void checkBeforeRetry();
      if (next.kind === 'processing') recheckLater();
      if (isMounted()) setError(next);
      return null;
    } finally {
      inFlight.current = false;
      if (isMounted()) setPending(false);
    }
  }, [accessToken, agreementId, invoiceId, outletId, queryClient, supplierName, toast, stamp,
    recovery.checking, checkBeforeRetry, recheckLater, isMounted]);

  const reset = useCallback(() => setError(null), []);

  return { pay, pending, error, reset, checking: recovery.checking, isMounted };
}
