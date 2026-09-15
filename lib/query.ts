import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api/errors';

/**
 * Query defaults.
 *
 * <p><b>Nothing retries a business refusal.</b> A 422 is the server saying no for
 * a reason the user has to act on; retrying it three times delays the message
 * they need to read. A 401 is not retried either — the session layer handles it,
 * and hammering an expired token achieves nothing.
 *
 * <p><b>Data is stale quickly and refetched on focus.</b> Prices, availability and
 * order status all move without the app knowing (§23A.35's stale rules), and the
 * realtime channel is a prompt to refresh rather than a source of truth (D-032).
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Short, because a supplier's price or an order's status can change
        // between one screen and the next.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
          if (error instanceof ApiError && !error.isRetryable) return false;
          return failureCount < 2;
        },
      },
      mutations: {
        // Never automatic. A mutation is retried only where the caller has an
        // idempotency key, and only deliberately — a blind retry of a checkout
        // places a second order.
        retry: false,
      },
    },
  });
}
