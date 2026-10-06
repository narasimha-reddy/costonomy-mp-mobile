import { apiRequest } from '@/lib/api/client';
import { API_BASE_URL } from '@/lib/api/config';
import { ApiError, NetworkError } from '@/lib/api/errors';
import { renewAccessToken } from '@/lib/api/session-bridge';
import { uploadParts } from '@/lib/api/upload';
import { buildTransactionsQuery } from '@/lib/wallet/history';
import { buildStatementQuery, fallbackFileName, fileNameFromDisposition } from '@/lib/wallet/statement';
import { BILL_STATUSES } from '@/models/wallet';
import type {
  BillFile,
  DetailBillStatus,
  InvoiceReview,
  InvoiceReviewPayload,
  ReviewLine,
  SkuOption,
  SupplierOption,
  StatementRequest,
  TopUpConfirmation,
  TopUpStatus,
  Wallet,
  WalletBillStatus,
  WalletBillSummary,
  WalletEntry,
  WalletEntryStatus,
  WalletFilters,
  WalletLimits,
  WalletMonthTotal,
  WalletTopUp,
  WalletInvoice,
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
 * usable, and the recent rows mapped like History's (`mapEntry`: bill status, unknown
 * status or instrument cleaned up).
 *
 * <p>A half-formed limits object is treated as none. A meter or a hint built on a
 * missing figure would show a wrong number, and the server checks every top-up
 * regardless — so unknown limits hide the meter rather than guess it.
 */
export function mapWallet(raw: Wallet): Wallet {
  const { limits, recent: rawRecent, ...others } = raw as Wallet & { limits?: Partial<Record<keyof WalletLimits, unknown>> | null };
  // The same row mapper as History, so a Recent row's bill is a known status or null.
  const rest = {
    ...others,
    recent: Array.isArray(rawRecent) ? (rawRecent as unknown as Record<string, unknown>[]).map(mapEntry) : [],
  };
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

/** A bill status this app knows, else null: an unknown word from a newer API is no status at all. */
function billStatus(value: unknown): WalletBillStatus | null {
  return BILL_STATUSES.find((s) => s === value) ?? null;
}

const count = (value: unknown): number | null =>
  (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null);

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
    bill: mapBill(raw.bill),
    at: String(raw.at ?? ''),
  };
}

/** The row's bill: a known status or null (no bill, or one this app cannot name). */
function mapBill(raw: unknown): WalletEntry['bill'] {
  const status = billStatus((raw as { status?: unknown } | null | undefined)?.status);
  return status == null ? null : { status };
}

/** The bill counts, only when all three are usable: half a summary would show a wrong banner. */
function mapBillSummary(raw: unknown): WalletBillSummary | null {
  if (raw == null || typeof raw !== 'object') return null;
  const { pending, reading, unreadable } = raw as Record<string, unknown>;
  const p = count(pending); const r = count(reading); const u = count(unreadable);
  return p == null || r == null || u == null ? null : { pending: p, reading: r, unreadable: u };
}

/** A page of history, tolerant of an older API that sends only some of it. */
export function mapTransactionsPage(raw: Record<string, unknown> | null | undefined): WalletTransactionsPage {
  const body = raw ?? {};
  const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

  const monthTotals: WalletMonthTotal[] = [];
  for (const total of list(body.monthTotals) as Record<string, unknown>[]) {
    const spent = money(total?.spent);
    if (typeof total?.month !== 'string' || spent == null) continue;
    const billsPending = count(total.billsPending);
    monthTotals.push({
      month: total.month, added: money(total.added) ?? '0', spent,
      ...(billsPending == null ? {} : { billsPending }),
    });
  }

  return {
    items: (list(body.items) as Record<string, unknown>[]).map(mapEntry),
    monthTotals,
    availableMonths: list(body.availableMonths).filter((m): m is string => typeof m === 'string'),
    nextCursor: typeof body.nextCursor === 'string' && body.nextCursor !== '' ? body.nextCursor : null,
    billSummary: mapBillSummary(body.billSummary),
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
  return {
    ...detail,
    references: detail.references ?? [],
    actions: {
      canWaiveBill: false,
      canUndoWaiver: false,
      ...(detail.actions ?? { canPayAgain: false }),
    },
    invoice: detail.invoice ?? null,
    billStatus: detailBillStatus((detail as { billStatus?: unknown }).billStatus),
  };
}

/** The details page's bill status: a known word (or NOT_REQUIRED), else null. */
function detailBillStatus(value: unknown): DetailBillStatus | null {
  return value === 'NOT_REQUIRED' ? 'NOT_REQUIRED' : billStatus(value);
}

const invoicePath = (outletId: number, entryId: number | string) =>
  `/api/v1/outlets/${outletId}/wallet/transactions/${encodeURIComponent(String(entryId))}/invoice`;

/** The bill of a wallet payment, with short-lived page links. 404 INVOICE_NOT_FOUND when there is none. */
export async function fetchWalletInvoice(
  outletId: number,
  entryId: number | string,
  token: string,
): Promise<WalletInvoice> {
  return mapInvoice(await apiRequest<WalletInvoice>(invoicePath(outletId, entryId), { token }));
}

/** Money as the wire sends it (a number or a decimal string) as a string, or null. */
function decimal(value: unknown): string | null {
  if (value == null || value === '') return null;
  return Number.isFinite(Number(value)) ? String(value) : null;
}

const text = (value: unknown): string | null => (typeof value === 'string' ? value : value == null ? null : String(value));
const idOrNull = (value: unknown): number | null =>
  (value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value));

/**
 * One line of a draft or review. `lineNo` stays exactly as sent: 1..N for a bill line, null for a line
 * the owner added (never made up from the position, which would clash with a bill line).
 */
function mapReviewLine(raw: Record<string, unknown>): ReviewLine {
  const from = raw.fromInvoice as Record<string, unknown> | null | undefined;
  const sku = raw.sku as Record<string, unknown> | null | undefined;
  return {
    lineNo: idOrNull(raw.lineNo),
    fromInvoice: from == null ? null : {
      name: text(from.name),
      quantity: decimal(from.quantity),
      unit: text(from.unit),
      unitPrice: decimal(from.unitPrice),
      total: decimal(from.total),
    },
    sku: sku == null ? null : {
      id: idOrNull(sku.id),
      name: text(sku.name) ?? '',
      unit: text(sku.unit),
      unitPrice: decimal(sku.unitPrice),
    },
    quantity: decimal(raw.quantity),
    unit: text(raw.unit),
    amount: decimal(raw.amount),
    tax: decimal(raw.tax),
    ignoredDeviation: raw.ignoredDeviation === true,
  };
}

/** A draft or saved review with money as strings and every list present. Null stays null. */
export function mapReview(raw: unknown): InvoiceReview | null {
  if (raw == null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const supplier = (r.supplier ?? {}) as Record<string, unknown>;
  return {
    supplier: { id: idOrNull(supplier.id), name: text(supplier.name) ?? '' },
    invoiceNumber: text(r.invoiceNumber),
    invoiceDate: text(r.invoiceDate),
    stockInDate: text(r.stockInDate),
    paymentStatus: r.paymentStatus === 'COMPLETED' ? 'COMPLETED' : 'PENDING',
    items: (Array.isArray(r.items) ? r.items : []).map((it) => mapReviewLine((it ?? {}) as Record<string, unknown>)),
    delivery: decimal(r.delivery),
    deliveryOverridden: r.deliveryOverridden === true,
    taxOverride: decimal(r.taxOverride),
    subtotal: decimal(r.subtotal),
    tax: decimal(r.tax),
    total: decimal(r.total),
    reviewedAt: text(r.reviewedAt),
    reviewedBy: idOrNull(r.reviewedBy),
  };
}

/** The bill as the screens read it: pages always a list, review and draft normalised, version a number. */
export function mapInvoice(invoice: WalletInvoice): WalletInvoice {
  return {
    ...invoice,
    pages: invoice.pages ?? [],
    version: Number.isFinite(Number(invoice.version)) ? Number(invoice.version) : 0,
    draft: mapReview(invoice.draft),
    review: mapReview(invoice.review),
  };
}

/**
 * Save the owner's review. The body is the review without the server's totals, plus the version the
 * form was built from: 200 returns the bill with the review and the server's computed totals;
 * 400 VALIDATION_ERROR carries per-field messages; 409 INVOICE_CHANGED means the bill moved on.
 *
 * <p>Never retried here (`retries: 0`): the caller decides, with the same key and the same body, and
 * only after a network failure or a timeout (`useSaveInvoiceReview`). The server honours the key, so a
 * repeat of a save that went through answers 200 with the bill as saved.
 */
export async function saveWalletInvoiceReview(
  outletId: number,
  entryId: number | string,
  payload: InvoiceReviewPayload,
  token: string,
  options: { idempotencyKey?: string; signal?: AbortSignal } = {},
): Promise<WalletInvoice> {
  return mapInvoice(await apiRequest<WalletInvoice>(`${invoicePath(outletId, entryId)}/review`, {
    method: 'PUT',
    token,
    body: payload,
    idempotencyKey: options.idempotencyKey,
    signal: options.signal,
    retries: 0,
  }));
}

const lookupPath = (outletId: number, kind: 'suppliers' | 'skus') => `/api/v1/outlets/${outletId}/invoice-lookups/${kind}`;

function lookupQuery(params: Record<string, string | number | null | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

/** The server rejects a longer `q` with a 400. */
export const LOOKUP_MAX_QUERY = 60;

const lookupText = (q: string) => q.trim().slice(0, LOOKUP_MAX_QUERY);

/**
 * Suppliers matching `q` (read-only): id and name only. Never retried (the picker shows the wait) and
 * abortable. Rows without an id or a name are dropped.
 */
export async function fetchSupplierLookup(
  outletId: number,
  q: string,
  token: string,
  options: { limit?: number; signal?: AbortSignal } = {},
): Promise<SupplierOption[]> {
  const query = lookupQuery({ q: lookupText(q), limit: options.limit ?? 20 });
  const rows = await apiRequest<unknown[]>(`${lookupPath(outletId, 'suppliers')}${query}`, {
    token, signal: options.signal, retries: 0,
  });
  return (Array.isArray(rows) ? rows : [])
    .map((r) => (r ?? {}) as Record<string, unknown>)
    .filter((r) => idOrNull(r.id) != null && typeof r.name === 'string' && r.name.trim() !== '')
    .map((r) => ({ id: Number(r.id), name: String(r.name) }));
}

/** SKUs matching `q` (read-only). Money as strings. Never retried; abortable. */
export async function fetchSkuLookup(
  outletId: number,
  q: string,
  token: string,
  options: { limit?: number; signal?: AbortSignal } = {},
): Promise<SkuOption[]> {
  const query = lookupQuery({ q: lookupText(q), limit: options.limit ?? 20 });
  const rows = await apiRequest<unknown[]>(`${lookupPath(outletId, 'skus')}${query}`, {
    token, signal: options.signal, retries: 0,
  });
  return (Array.isArray(rows) ? rows : [])
    .map((r) => (r ?? {}) as Record<string, unknown>)
    .filter((r) => idOrNull(r.id) != null && typeof r.name === 'string' && r.name.trim() !== '')
    .map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      unit: text(r.unit),
      unitPrice: decimal(r.unitPrice),
      categoryName: text(r.categoryName),
    }));
}

/**
 * Add a bill: one to five files, sent as `file` parts. Not retried (a second try could be a second
 * bill), but an expired access token is renewed once. `onProgress` gets 0..1 as the body goes up.
 */
export async function uploadWalletInvoice(
  outletId: number,
  entryId: number | string,
  files: BillFile[],
  token: string,
  onProgress?: (fraction: number) => void,
): Promise<WalletInvoice> {
  try {
    return await uploadParts<WalletInvoice>(invoicePath(outletId, entryId), files, token, onProgress);
  } catch (error) {
    if (error instanceof ApiError && error.isUnauthenticated) {
      const fresh = await renewAccessToken();
      if (fresh != null) return uploadParts<WalletInvoice>(invoicePath(outletId, entryId), files, fresh, onProgress);
    }
    throw error;
  }
}

/** Remove the bill (204). */
export async function deleteWalletInvoice(
  outletId: number,
  entryId: number | string,
  token: string,
): Promise<void> {
  await apiRequest<void>(invoicePath(outletId, entryId), { token, method: 'DELETE' });
}

/** Say this payment needs no bill (200). 422 INVOICE_NOT_ALLOWED, 409 INVOICE_EXISTS. */
export async function waiveWalletBill(
  outletId: number,
  entryId: number | string,
  token: string,
): Promise<void> {
  await apiRequest<void>(`${invoicePath(outletId, entryId)}/waiver`, { token, method: 'PUT' });
}

/** Take back "no bill needed" (204). */
export async function undoWalletBillWaiver(
  outletId: number,
  entryId: number | string,
  token: string,
): Promise<void> {
  await apiRequest<void>(`${invoicePath(outletId, entryId)}/waiver`, { token, method: 'DELETE' });
}
