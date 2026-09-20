import { apiRequest } from '@/lib/api/client';
import type { Wallet } from '@/models/wallet';

/**
 * The outlet's prepaid balance.
 *
 * <p>Read before offering to pay from it: a wallet that cannot cover the order
 * is an option that fails at the moment of ordering, which is the worst place
 * to learn it.
 */
export function fetchWallet(token: string, outletId: number): Promise<Wallet> {
  return apiRequest<Wallet>(`/api/v1/outlets/${outletId}/wallet`, { token });
}

/**
 * Put money in.
 *
 * <p>Stands in for a funding rail that does not exist yet — see the endpoint's
 * own note. Here so the wallet can be used end to end.
 */
export function topUpWallet(
  token: string,
  outletId: number,
  amount: string,
  reason?: string,
): Promise<Wallet> {
  return apiRequest<Wallet>(`/api/v1/outlets/${outletId}/wallet/top-up`, {
    method: 'POST',
    token,
    body: { amount, reason },
  });
}
