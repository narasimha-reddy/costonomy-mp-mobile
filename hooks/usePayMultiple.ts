import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { newIdempotencyKey } from '@/lib/api/client';
import { isDefinitiveFailure } from '@/lib/api/idempotency';
import { walletKey } from '@/lib/queryKeys';
import { classifyPayError, type PayError } from '@/hooks/usePayFromWallet';
import { repayFromWallet } from '@/services/credit';
import type { WalletRepayment } from '@/models/credit';

/** One supplier to pay: the amount is the server's, as a decimal string of at most 2 places. */
export interface PayItem {
  agreementId: number;
  supplierName: string;
  amount: string;
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
 * idempotency key, held per (agreement, amount) and sent again on a retry whose
 * outcome is unknown, so a retry can never debit twice. A refusal (4xx) ends
 * that attempt and its key is dropped, as in `usePayFromWallet`.
 *
 * <p><b>Independent.</b> When one fails the next is still sent: the server, not
 * the app, decides each one. Nothing is reported paid before its own answer.
 */
export function usePayMultiple() {
  const { accessToken } = useSession();
  const { outletId } = useOutlet();
  const queryClient = useQueryClient();
  const keys = useRef(new Map<string, string>());
  const inFlight = useRef(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Record<number, PayItemResult>>({});

  const refresh = useCallback((agreementId: number) => {
    void queryClient.invalidateQueries({ queryKey: walletKey(outletId) });
    void queryClient.invalidateQueries({ queryKey: ['outlet', outletId, 'credit'] });
    void queryClient.invalidateQueries({ queryKey: ['credit-agreement', agreementId] });
  }, [outletId, queryClient]);

  const run = useCallback(async (items: PayItem[]): Promise<Record<number, PayItemResult>> => {
    if (inFlight.current || accessToken == null) return {};
    inFlight.current = true;
    setRunning(true);
    // A new run forgets the old answer for these rows: until the server
    // answers again, nothing is said about them.
    setResults((previous) => {
      const next = { ...previous };
      for (const item of items) delete next[item.agreementId];
      return next;
    });
    const out: Record<number, PayItemResult> = {};
    try {
      for (const item of items) {
        const signature = `${item.agreementId}|${item.amount}`;
        let key = keys.current.get(signature);
        if (key == null) {
          key = newIdempotencyKey();
          keys.current.set(signature, key);
        }
        try {
          const response = await repayFromWallet(
            accessToken, item.agreementId, { amount: Number(item.amount) }, key);
          keys.current.delete(signature);
          out[item.agreementId] = { status: 'paid', response };
          refresh(item.agreementId);
        } catch (caught) {
          if (isDefinitiveFailure(caught)) keys.current.delete(signature);
          out[item.agreementId] = { status: 'failed', error: classifyPayError(caught) };
        }
        setResults((previous) => ({ ...previous, [item.agreementId]: out[item.agreementId] as PayItemResult }));
      }
    } finally {
      inFlight.current = false;
      setRunning(false);
      for (const item of items) refresh(item.agreementId);
    }
    return out;
  }, [accessToken, refresh]);

  const reset = useCallback(() => setResults({}), []);

  return { run, running, results, reset };
}
