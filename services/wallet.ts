import { apiRequest } from '@/lib/api/client';
import { API_BASE_URL } from '@/lib/api/config';
import { ApiError, NetworkError } from '@/lib/api/errors';
import { renewAccessToken } from '@/lib/api/session-bridge';
import { buildTransactionsQuery } from '@/lib/wallet/history';
import { buildStatementQuery, fallbackFileName, fileNameFromDisposition } from '@/lib/wallet/statement';
import type {
  StatementRequest,
  TopUpConfirmation,
  TopUpStatus,
  Wallet,
  WalletEntry,
  WalletEntryStatus,
  WalletFilters,
  WalletLimits,
  WalletMonthTotal,
  WalletTopUp,
  WalletTransactionDetail,
  WalletTransactionsPage,
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

const ENTRY_STATUSES: WalletEntryStatus[] = ['COMPLETED', 'IN_PROGRESS', 'FAILED', 'RETURNED'];

/** Money as the wire sends it, a JSON number or a string, kept as the string the app passes around. */
function money(value: unknown): string | null {
  if (value == null || value === '') return null;
  return Number.isFinite(Number(value)) ? String(value) : null;
}

/**
 * One history row as the screens read it.
 *
 * <p>`status` and `instrument` are kept only when usable: an older API sends neither
 * and a row is then a plain completed one, and a status this app does not know is
 * treated the same rather than guessed at.
 */
export function mapEntry(raw: Record<string, unknown>): WalletEntry {
  const status = ENTRY_STATUSES.find((s) => s === raw.status);
  const instrument = typeof raw.instrument === 'string' && raw.instrument.trim() !== ''
    ? raw.instrument.trim() : null;
  return {
    id: Number(raw.id),
    key: typeof raw.key === 'string' && raw.key !== '' ? raw.key : undefined,
    direction: raw.direction === 'CREDIT' ? 'CREDIT' : 'DEBIT',
    kind: raw.kind as WalletEntry['kind'],
    amount: money(raw.amount) ?? '0',
    balanceAfter: money(raw.balanceAfter),
    supplierOrderId: raw.supplierOrderId == null ? null : Number(raw.supplierOrderId),
    reason: typeof raw.reason === 'string' ? raw.reason : null,
    refundStatus: typeof raw.refundStatus === 'string' ? raw.refundStatus : null,
    status,
    instrument,
    at: String(raw.at ?? ''),
  };
}

/** A page of history, tolerant of an older API that sends only some of it. */
export function mapTransactionsPage(raw: Record<string, unknown> | null | undefined): WalletTransactionsPage {
  const body = raw ?? {};
  const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

  const monthTotals: WalletMonthTotal[] = [];
  for (const total of list(body.monthTotals) as Record<string, unknown>[]) {
    const spent = money(total?.spent);
    if (typeof total?.month !== 'string' || spent == null) continue;
    monthTotals.push({ month: total.month, added: money(total.added) ?? '0', spent });
  }

  return {
    items: (list(body.items) as Record<string, unknown>[]).map(mapEntry),
    monthTotals,
    availableMonths: list(body.availableMonths).filter((m): m is string => typeof m === 'string'),
    nextCursor: typeof body.nextCursor === 'string' && body.nextCursor !== '' ? body.nextCursor : null,
  };
}

/**
 * The wallet's full history, a page at a time (`nextCursor` on to the next).
 *
 * <p>Months, categories and statuses are the server's to apply; the instrument is
 * not sent, because the server does not filter by it.
 */
export async function fetchWalletTransactions(
  token: string,
  outletId: number,
  params: { filters?: WalletFilters; cursor?: string | null; size?: number } = {},
): Promise<WalletTransactionsPage> {
  const query = buildTransactionsQuery(params);
  return mapTransactionsPage(await apiRequest<Record<string, unknown>>(
    `/api/v1/outlets/${outletId}/wallet/transactions${query}`, { token }));
}

export interface StatementFile {
  blob: Blob;
  filename: string;
}

/**
 * Download a statement as a file.
 *
 * <p>Its own fetch, not `apiRequest`, which unwraps a JSON envelope and a PDF is not
 * one. What it keeps is what matters: the bearer token, one renewal on a 401, and the
 * server's own words when it refuses (a period too long, too many rows).
 */
export async function fetchWalletStatement(
  token: string,
  outletId: number,
  request: StatementRequest,
): Promise<StatementFile> {
  const url = `${API_BASE_URL}/api/v1/outlets/${outletId}/wallet/statement${buildStatementQuery(request)}`;

  let bearer = token;
  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, { headers: { Authorization: `Bearer ${bearer}` } });
    } catch {
      throw new NetworkError();
    }

    if (response.ok) {
      return {
        blob: await response.blob(),
        filename: fileNameFromDisposition(
          response.headers.get('Content-Disposition'), fallbackFileName(request.format)),
      };
    }

    let envelope: { error?: { code?: string; message?: string; details?: Record<string, unknown> } } | null = null;
    try { envelope = JSON.parse(await response.text()); } catch { envelope = null; }
    const error = new ApiError({
      code: envelope?.error?.code ?? 'UNEXPECTED_ERROR',
      message: envelope?.error?.message ?? 'Something went wrong. Please try again.',
      status: response.status,
      details: envelope?.error?.details,
    });

    if (error.isUnauthenticated && attempt === 0) {
      const fresh = await renewAccessToken();
      if (fresh != null) { bearer = fresh; continue; }
    }
    throw error;
  }
  throw new NetworkError();
}

/**
 * One wallet movement in full, for the Transaction details screen.
 *
 * <p>`entryId` is the numeric id the History row carries. The server answers 404 for
 * an entry that does not exist or belongs to another outlet; callers show that as
 * "Transaction not found". The server masks the counterparty; nothing here unmasks it.
 */
export async function fetchWalletTransaction(
  outletId: number,
  entryId: number | string,
  token: string,
): Promise<WalletTransactionDetail> {
  const detail = await apiRequest<WalletTransactionDetail>(
    `/api/v1/outlets/${outletId}/wallet/transactions/${encodeURIComponent(String(entryId))}`,
    { token },
  );
  return { ...detail, references: detail.references ?? [], actions: detail.actions ?? { canPayAgain: false } };
}
