import { useCallback, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { newIdempotencyKey } from '@/lib/api/client';
import { ApiError, NetworkError, RequestTimeoutError } from '@/lib/api/errors';
import { isDefinitiveFailure } from '@/lib/api/idempotency';
import { walletInvoiceKey, walletTransactionKey } from '@/lib/queryKeys';
import { reviewMatchesPayload } from '@/lib/wallet/billReview';
import type { InvoiceReviewPayload, WalletInvoice } from '@/models/wallet';
import { fetchWalletInvoice, saveWalletInvoiceReview } from '@/services/wallet';

/** How long one attempt waits for an answer before giving up on it. */
export const SAVE_TIMEOUT_MS = 20_000;
/** The pause before the one automatic repeat of a save whose answer did not arrive. */
export const SAVE_RETRY_DELAY_MS = 600;

const pause = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

/**
 * Save a bill review, then put the returned bill (with the server's totals) in the cache and refresh
 * the details page so its Invoice row shows the reviewed supplier and total.
 *
 * <p><b>Repeats.</b> The client layer never repeats this PUT on its own (`retries: 0`). Here, a save
 * whose answer was lost (no network, or no answer within {@link SAVE_TIMEOUT_MS}) is sent once more,
 * identical, with the same `Idempotency-Key`: the server honours the key, so if the first one went
 * through, the repeat answers 200 with the bill as saved. Nothing else is repeated automatically.
 * One key per body: Try again with the same edits reuses it; a refusal, or different edits, get a new one.
 *
 * <p><b>409 INVOICE_CHANGED.</b> The bill's version moved on. That can be this very save (its answer
 * lost, and the repeat refused on the old version by a server that did not match the key), or another
 * device. The bill is fetched again: if its saved review is what was sent, the save is a success;
 * otherwise the 409 is passed on and the screen offers to reload.
 */
export function useSaveInvoiceReview(entryId: string | undefined) {
  const { accessToken } = useSession();
  const { outlet } = useOutlet();
  const client = useQueryClient();
  const pending = useRef<{ key: string; body: string } | null>(null);

  const keyFor = useCallback((payload: InvoiceReviewPayload) => {
    const body = JSON.stringify(payload);
    if (pending.current == null || pending.current.body !== body) pending.current = { key: newIdempotencyKey(), body };
    return pending.current.key;
  }, []);

  const attempt = useCallback(async (payload: InvoiceReviewPayload, key: string): Promise<WalletInvoice> => {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, SAVE_TIMEOUT_MS);
    try {
      return await saveWalletInvoiceReview(outlet?.id as number, entryId as string, payload, accessToken as string, {
        idempotencyKey: key,
        signal: controller.signal,
      });
    } catch (error) {
      if (timedOut) throw new RequestTimeoutError();
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }, [outlet?.id, entryId, accessToken]);

  return useMutation({
    mutationFn: async (payload: InvoiceReviewPayload) => {
      const key = keyFor(payload);
      try {
        try {
          return await attempt(payload, key);
        } catch (error) {
          // Only a lost answer is worth one identical repeat; anything the server said is final here.
          if (!(error instanceof NetworkError)) throw error;
          await pause(SAVE_RETRY_DELAY_MS);
          return await attempt(payload, key);
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 409 && error.code === 'INVOICE_CHANGED') {
          const fresh = await fetchWalletInvoice(outlet?.id as number, entryId as string, accessToken as string)
            .catch(() => null);
          if (fresh != null && reviewMatchesPayload(fresh.review, payload)) return fresh;
        }
        if (isDefinitiveFailure(error)) pending.current = null;
        throw error;
      }
    },
    onSuccess: async (invoice) => {
      pending.current = null;
      client.setQueryData(walletInvoiceKey(outlet?.id, entryId), invoice);
      await client.invalidateQueries({ queryKey: walletTransactionKey(outlet?.id, entryId) });
    },
  });
}
