import { apiRequest } from '@/lib/api/client';
import type { Wallet, Withdrawal } from '@/models/wallet';

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

/**
 * Send refund money back to the card or bank it came from (API D-104).
 *
 * <p>Only refund money can go, and only to where it came from — the server splits
 * it across the payments it was refunded from. The balance drops at once; each
 * part reaches the card in the bank's usual time, and its progress is on the
 * statement.
 */
export function withdrawFromWallet(
  token: string,
  outletId: number,
  amount: string,
  idempotencyKey: string,
): Promise<Withdrawal> {
  return apiRequest<Withdrawal>(`/api/v1/outlets/${outletId}/wallet/withdraw`, {
    method: 'POST',
    token,
    idempotencyKey,
    body: { amount },
  });
}
