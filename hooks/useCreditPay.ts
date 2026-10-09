import { useCallback, useRef, useState } from 'react';
import Constants from 'expo-constants';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { useIdempotencyKey } from '@/hooks/useIdempotencyKey';
import { openRazorpayCheckout } from '@/lib/payments/razorpayCheckout';
import { creditPayableKey, creditPayAttemptKey, walletKey } from '@/lib/queryKeys';
import { createSingleFlight, withTimeout } from '@/lib/wallet/topUpFlow';
import {
  runCreditPay, type CreditPayDeps, type CreditPayOutcome, type CreditPayPhase,
} from '@/lib/credit/pay/payFlow';
import {
  createCreditPayment, fetchCreditPayment, fetchPayableInvoices, quoteCreditPayment, verifyCreditPayment,
} from '@/services/creditPay';
import type { CreditPayAttempt, CreditPayMethod, PayItem } from '@/models/creditPay';
import { Colors } from '@/theme';

/** How long verify gets before the payment is treated as "still confirming". */
const VERIFY_TIMEOUT_MS = 20_000;

/** The picker's invoices, as the server lists them. */
export function usePayableInvoices() {
  const { accessToken } = useSession();
  const { outletId } = useOutlet();
  return useQuery({
    queryKey: creditPayableKey(outletId),
    queryFn: () => fetchPayableInvoices(accessToken as string, outletId as number),
    enabled: outletId != null && accessToken != null,
  });
}

/** One attempt, for the result screen. Polling is the screen's decision (`refetchInterval`). */
export function useCreditPayAttempt(
  attemptId: string | undefined,
  refetchInterval: (attempt: CreditPayAttempt | undefined) => number | false,
) {
  const { accessToken } = useSession();
  const { outletId } = useOutlet();
  return useQuery({
    queryKey: creditPayAttemptKey(outletId, attemptId ?? ''),
    queryFn: () => fetchCreditPayment(accessToken as string, outletId as number, attemptId as string),
    enabled: outletId != null && accessToken != null && attemptId != null,
    refetchInterval: (q) => refetchInterval(q.state.data),
  });
}

/** Everything a payment can have changed, re-read. */
export function useRefreshCredit() {
  const queryClient = useQueryClient();
  const { outletId } = useOutlet();
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['outlet', outletId, 'credit'] });
    void queryClient.invalidateQueries({ queryKey: ['credit-agreement'] });
    void queryClient.invalidateQueries({ queryKey: ['credit-invoice'] });
    void queryClient.invalidateQueries({ queryKey: walletKey(outletId) });
  }, [queryClient, outletId]);
}

/** A key belongs to one selection and channel: UPI and card share one (one Razorpay order). */
export function selectionSignature(items: PayItem[], method: CreditPayMethod): string {
  const channel = method === 'WALLET' ? 'WALLET' : 'ONLINE';
  const parts = [...items].sort((a, b) => a.invoiceId - b.invoiceId).map((i) => `${i.invoiceId}:${i.outstanding}`);
  return `${channel}|${parts.join(',')}`;
}

/**
 * Pay the chosen invoices: quote, then the whole sequence of `runCreditPay`.
 *
 * <p>One run at a time. The idempotency key is held across a retry whose outcome was unknown
 * (a dropped create) and dropped on any known ending, or when the selection changes.
 */
export function useCreditPay() {
  const { accessToken } = useSession();
  const { outletId } = useOutlet();
  const idempotency = useIdempotencyKey();
  const refresh = useRefreshCredit();
  const [state, setState] = useState<{ phase: CreditPayPhase; message: string | null }>({ phase: 'idle', message: null });
  const flight = useRef(createSingleFlight<CreditPayOutcome>());
  const keyed = useRef<string | null>(null);

  const quote = useCallback((items: PayItem[]) =>
    quoteCreditPayment(accessToken as string, outletId as number, items), [accessToken, outletId]);

  const pay = useCallback((items: PayItem[], method: CreditPayMethod): Promise<CreditPayOutcome | null> => {
    if (accessToken == null || outletId == null) return Promise.resolve(null);
    const token = accessToken;
    const outlet = outletId;
    return flight.current.run(async () => {
      const signature = selectionSignature(items, method);
      if (keyed.current !== signature) idempotency.reset();
      keyed.current = signature;

      const deps: CreditPayDeps = {
        create: (list, m, k) => createCreditPayment(token, outlet, list, m, k),
        checkout: async (attempt, m) => {
          const result = await openRazorpayCheckout({
            key: attempt.keyId ?? '',
            providerOrderId: attempt.razorpayOrderId ?? '',
            merchantName: Constants.expoConfig?.name ?? '',
            description: 'Pay credit dues',
            themeColor: Colors.primary,
            method: m,
          });
          return { paymentId: result.providerPaymentId, signature: result.providerSignature };
        },
        verify: (id, proof) => withTimeout(verifyCreditPayment(token, outlet, id, proof), VERIFY_TIMEOUT_MS),
        status: (id) => fetchCreditPayment(token, outlet, id),
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        onPhase: setState,
      };
      const outcome = await runCreditPay(deps, items, method, idempotency.key());
      idempotency.settle(outcome.createError);
      if (outcome.createError === undefined) keyed.current = null;
      void refresh();
      return outcome;
    });
  }, [accessToken, outletId, idempotency, refresh]);

  const busy = state.phase === 'creating' || state.phase === 'checkout' || state.phase === 'verifying';
  const reset = useCallback(() => setState({ phase: 'idle', message: null }), []);
  return { state, busy, pay, quote, reset };
}
