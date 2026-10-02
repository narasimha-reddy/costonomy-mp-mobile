import { apiRequest } from '@/lib/api/client';
import type {
  TopUpConfirmation,
  TopUpStatus,
  Wallet,
  WalletLimits,
  WalletTopUp,
  Withdrawal,
} from '@/models/wallet';

/**
 * The outlet's prepaid balance.
 *
 * <p>Read before offering to pay from it: a wallet that cannot cover the order
 * is an option that fails at the moment of ordering, which is the worst place
 * to learn it.
 */
export async function fetchWallet(token: string, outletId: number): Promise<Wallet> {
  return mapWallet(await apiRequest<Wallet>(`/api/v1/outlets/${outletId}/wallet`, { token }));
}

const LIMIT_FIELDS: (keyof WalletLimits)[] = [
  'maxBalance', 'monthlyTopUpLimit', 'addedThisMonth', 'remainingThisMonth', 'minTopUp', 'maxTopUp',
];

/**
 * The wallet as the screens read it: limits kept only when all six figures are
 * usable.
 *
 * <p>A half-formed limits object is treated as none. A meter or a hint built on a
 * missing figure would show a wrong number, and the server checks every top-up
 * regardless — so unknown limits hide the meter rather than guess it.
 */
export function mapWallet(raw: Wallet): Wallet {
  const { limits, ...rest } = raw as Wallet & { limits?: Partial<Record<keyof WalletLimits, unknown>> | null };
  if (limits == null || typeof limits !== 'object') return rest as Wallet;

  const mapped: Partial<WalletLimits> = {};
  for (const field of LIMIT_FIELDS) {
    const value = limits[field];
    if (value == null || value === '' || !Number.isFinite(Number(value))) return rest as Wallet;
    mapped[field] = String(value);
  }
  return { ...rest, limits: mapped as WalletLimits } as Wallet;
}

/** `WalletDtos.TopUpResponse`, in the server's names. */
interface TopUpResponse {
  topUpId: number | string;
  razorpayOrderId: string;
  keyId: string;
  amount: string;
  currency: string;
}

/**
 * Open a top-up: the server creates the provider's order for exactly this amount.
 *
 * <p>The key is the caller's, one per attempt, so a retry after a dropped
 * response reaches the same top-up instead of opening a second one.
 */
export async function createTopUp(
  token: string,
  outletId: number,
  amount: string,
  idempotencyKey: string,
): Promise<WalletTopUp> {
  const created = await apiRequest<TopUpResponse>(`/api/v1/outlets/${outletId}/wallet/top-ups`, {
    method: 'POST',
    token,
    idempotencyKey,
    body: { amount },
  });
  return {
    topUpId: String(created.topUpId),
    providerOrderId: created.razorpayOrderId,
    publicKey: created.keyId,
    amount: created.amount,
    currency: created.currency,
  };
}

/**
 * Tell the server the customer paid; it checks with the provider and credits the
 * wallet.
 *
 * <p>Sends what the provider's checkout returned and nothing else — the client
 * cannot assert a payment succeeded, only present the proof. An answer with no
 * wallet in it is "still processing", not a failure: the server's own job credits
 * the payment.
 */
export async function confirmTopUp(
  token: string,
  outletId: number,
  topUpId: string,
  proof: { paymentId: string; signature?: string },
): Promise<TopUpConfirmation> {
  const answer = await apiRequest<Wallet | { status?: string } | null>(
    `/api/v1/outlets/${outletId}/wallet/top-ups/${encodeURIComponent(topUpId)}/confirm`,
    {
      method: 'POST',
      token,
      body: { razorpayPaymentId: proof.paymentId, razorpaySignature: proof.signature },
    },
  );
  if (answer == null || !('balance' in answer) || answer.balance == null) {
    return { pending: true, wallet: null };
  }
  return { pending: false, wallet: mapWallet(answer as Wallet) };
}

/** Where a top-up has got to. A read: asking again never moves money. */
export async function fetchTopUpStatus(
  token: string,
  outletId: number,
  topUpId: string,
): Promise<TopUpStatus> {
  const top = await apiRequest<{ status: TopUpStatus }>(
    `/api/v1/outlets/${outletId}/wallet/top-ups/${encodeURIComponent(topUpId)}`,
    { token },
  );
  return top.status;
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
