import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { isDefinitiveFailure } from '@/lib/api/idempotency';
import { attemptKey, settleAttempt } from '@/lib/credit/attemptKeys';
import { useAttemptRecovery } from '@/hooks/useAttemptRecovery';
import { walletKey } from '@/lib/queryKeys';
import { classifyPayError, type PayError } from '@/hooks/usePayFromWallet';
import { repayFromWallet } from '@/services/credit';
import type { WalletRepayment } from '@/models/credit';

/** One supplier to pay: the amount is the server's, as a decimal string of at most 2 places. */
export interface PayItem {
  agreementId: number;
  supplierName: string;
  amount: string;
  /** A fingerprint of the figures shown (see `PayTarget.stamp`). */
  stamp?: string;
}

export type PayItemResult =
  | { status: 'paid'; response: WalletRepayment }
  | { status: 'failed'; error: PayError };

/**
 * Repay several suppliers from the one wallet.
 *
 * <p><b>Strictly one after another.</b> The suppliers share a wallet, so two
 * repayments in flight at once could each see enough money and both be refused
 * or both be taken. Each repayment is its own server call under its own
 * idempotency key, held per (outlet, agreement, amount) in `lib/credit/attemptKeys`
 * (so it outlives the sheet) and sent again on a retry whose outcome is unknown,
 * so a retry can never debit twice. A refusal (4xx) ends that attempt and its key
 * is dropped, as in `usePayFromWallet`. The same signature as the single-supplier
 * sheet, so the two share an undecided attempt.
 *
 * <p>`IDEMPOTENCY_KEY_REUSE` on a row refreshes everything and holds `checking`
 * true until that is done.
 *
 * <p><b>Independent.</b> When one fails the next is still sent: the server, not
 * the app, decides each one. Nothing is reported paid before its own answer.
 */
export function usePayMultiple() {
  const { accessToken } = useSession();
  const { outletId } = useOutlet();
  const queryClient = useQueryClient();
  const inFlight = useRef(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Record<number, PayItemResult>>({});
  const recovery = useAttemptRecovery([]);
  const { isMounted, checkBeforeRetry, recheckLater } = recovery;

  const refresh = useCallback((agreementId: number) => {
    void queryClient.invalidateQueries({ queryKey: walletKey(outletId) });
    void queryClient.invalidateQueries({ queryKey: ['outlet', outletId, 'credit'] });
    void queryClient.invalidateQueries({ queryKey: ['credit-agreement', agreementId] });
  }, [outletId, queryClient]);

  const run = useCallback(async (items: PayItem[]): Promise<Record<number, PayItemResult>> => {
    if (inFlight.current || recovery.checking || accessToken == null) return {};
    inFlight.current = true;
    setRunning(true);
    // A new run forgets the old answer for these rows: until the server
    // answers again, nothing is said about them.
    setResults((previous) => {
      const next = { ...previous };
      for (const item of items) delete next[item.agreementId];
      return next;
    });
    let reuse = false;
    let processing = false;
    const out: Record<number, PayItemResult> = {};
    try {
      for (const item of items) {
        const signature = `pay|${outletId}|${item.agreementId}|${item.amount}|`;
        const key = attemptKey(signature, item.stamp);
        try {
          const response = await repayFromWallet(
            accessToken, item.agreementId, { amount: Number(item.amount) }, key);
          settleAttempt(signature);
          out[item.agreementId] = { status: 'paid', response };
          refresh(item.agreementId);
        } catch (caught) {
          if (isDefinitiveFailure(caught)) settleAttempt(signature);
          const error = classifyPayError(caught);
          if (error.kind === 'reuse') reuse = true;
          if (error.kind === 'processing') processing = true;
          out[item.agreementId] = { status: 'failed', error };
        }
        if (!isMounted()) continue;
        setResults((previous) => ({ ...previous, [item.agreementId]: out[item.agreementId] as PayItemResult }));
      }
    } finally {
      inFlight.current = false;
      if (isMounted()) setRunning(false);
      for (const item of items) refresh(item.agreementId);
    }
    if (reuse) void checkBeforeRetry();
    if (processing) recheckLater();
    return out;
  }, [accessToken, outletId, refresh, recovery.checking, checkBeforeRetry, recheckLater, isMounted]);

  const reset = useCallback(() => setResults({}), []);

  return { run, running, results, reset, checking: recovery.checking };
}
