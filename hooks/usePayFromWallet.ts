import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { useToast } from '@/components/common';
import { ApiError } from '@/lib/api/errors';
import { walletKey } from '@/lib/queryKeys';
import { useIdempotencyKey } from '@/hooks/useIdempotencyKey';
import { isOverpaymentError, isShortBalanceError, repayFromWallet } from '@/services/credit';
import type { WalletRepayment } from '@/models/credit';
import { formatMoney } from '@/utils/money';

/** What went wrong, in the terms the sheet words. Never a raw code. */
export type PayError =
  | { kind: 'short'; shortBy: number; balance: number }
  | { kind: 'overpayment'; outstanding: number }
  | { kind: 'forbidden' }
  | { kind: 'other'; message: string };

export interface PayTarget {
  agreementId: number;
  supplierName: string;
  /** Set when paying one invoice from its own screen. */
  invoiceId?: number;
}

function classify(caught: unknown): PayError {
  const short = isShortBalanceError(caught);
  if (short != null) return { kind: 'short', ...short };
  const over = isOverpaymentError(caught);
  if (over != null) return { kind: 'overpayment', ...over };
  if (caught instanceof ApiError && caught.code === 'FORBIDDEN') return { kind: 'forbidden' };
  const message = caught instanceof Error && caught.message !== ''
    ? caught.message : 'Something went wrong. Please try again.';
  return { kind: 'other', message };
}

/**
 * Repay a credit agreement from the wallet.
 *
 * <p><b>The idempotency key belongs to one attempt.</b> It is made once per
 * distinct (agreement, amount, invoice) and sent again on a retry whose outcome
 * is unknown (a 5xx, a dropped connection), so a double tap or a retry can never
 * debit the wallet twice. A different amount is a different attempt and gets a
 * new key; a success or a refusal ends the attempt and drops it.
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
  const idempotency = useIdempotencyKey();
  const keyedFor = useRef<string | null>(null);
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PayError | null>(null);

  const { agreementId, supplierName, invoiceId } = target;

  const pay = useCallback(async (amount: string): Promise<WalletRepayment | null> => {
    if (inFlight.current || accessToken == null) return null;
    inFlight.current = true;
    setPending(true);
    setError(null);

    const signature = `${agreementId}|${amount}|${invoiceId ?? ''}`;
    if (keyedFor.current !== signature) idempotency.settle();
    keyedFor.current = signature;
    const key = idempotency.key();

    try {
      const response = await repayFromWallet(
        accessToken,
        agreementId,
        invoiceId == null
          ? { amount: Number(amount) }
          : { amount: Number(amount), invoiceIds: [invoiceId] },
        key,
      );
      idempotency.settle();
      keyedFor.current = null;
      // Refresh in the background: the answer is already in hand.
      void queryClient.invalidateQueries({ queryKey: walletKey(outletId) });
      void queryClient.invalidateQueries({ queryKey: ['outlet', outletId, 'credit'] });
      void queryClient.invalidateQueries({ queryKey: ['credit-agreement', agreementId] });
      toast.show(`Paid ${formatMoney(response.amount)} to ${supplierName}`, 'success');
      return response;
    } catch (caught) {
      idempotency.settle(caught);
      if (isOverpaymentError(caught) != null) {
        void queryClient.invalidateQueries({ queryKey: ['outlet', outletId, 'credit'] });
        void queryClient.invalidateQueries({ queryKey: ['credit-agreement', agreementId] });
      }
      setError(classify(caught));
      return null;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }, [accessToken, agreementId, invoiceId, outletId, queryClient, supplierName, toast, idempotency]);

  const reset = useCallback(() => setError(null), []);

  return { pay, pending, error, reset };
}
