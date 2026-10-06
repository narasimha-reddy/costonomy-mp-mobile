import { apiRequest } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import type {
  CreditAgreement,
  CreditAttention,
  CreditInvoiceDetail,
  CreditStatement,
  WalletRepayment,
  WalletRepaymentRequest,
  CreditInvoice,
  CreditLedgerEntry,
  CreditSummary,
  ClaimResponse,
  ClaimStatus,
  SubmitClaimRequest,
  CreditPayoutList,
  PayoutStatusFilter,
  StorePaymentList,
  StorePaymentSource,
  Ageing,
  Receivables,
  ReceivablesPage,
  ReceivablesSort,
  ReceivablesStatus,
  ExtendDueResponse,
  PaymentPreview,
  RecordPaymentBody,
  RecordedPayment,
  ReversalResult,
  Reminder,
  ReminderList,
  ReminderPreview,
} from '@/models/credit';

// ── Restaurant side ───────────────────────────────────────────────────

/** The outlet's whole credit position across every supplier. Doc 05 §19. */
export function fetchCreditSummary(token: string, outletId: number): Promise<CreditSummary> {
  return apiRequest<CreditSummary>(`/api/v1/outlets/${outletId}/credit/summary`, { token });
}

/** Whether anything is overdue or due soon. No amounts, by design. */
export function fetchCreditAttention(token: string, outletId: number): Promise<CreditAttention> {
  return apiRequest<CreditAttention>(`/api/v1/outlets/${outletId}/credit/attention`, { token });
}

export function fetchOutletAgreements(token: string, outletId: number): Promise<CreditAgreement[]> {
  return apiRequest<CreditAgreement[]>(`/api/v1/outlets/${outletId}/credit/agreements`, { token });
}

export interface CreditRequestInput {
  supplierStoreId: number;
  outletId: number;
  requestedLimit: string;
  requestedDays: number;
  purpose?: string;
  note?: string;
}

export function requestCredit(token: string, input: CreditRequestInput): Promise<CreditAgreement> {
  return apiRequest<CreditAgreement>('/api/v1/credit/requests', {
    method: 'POST',
    token,
    body: input,
  });
}

/**
 * Accept terms a supplier changed.
 *
 * <p>Doc 04 §13: a supplier modification is explicit and versioned, and the
 * credit is not usable until the restaurant accepts it. This is that acceptance —
 * it must never be sent automatically on the restaurant's behalf. `termsVersion` is
 * the version on screen; the server refuses (CREDIT_TERMS_CHANGED) if the terms moved on.
 */
export function acceptAgreement(
  token: string,
  agreementId: number,
  termsVersion?: number | null,
): Promise<CreditAgreement> {
  return apiRequest<CreditAgreement>(`/api/v1/credit/agreements/${agreementId}/accept`, {
    method: 'POST',
    token,
    // The version the restaurant saw: the server answers CREDIT_TERMS_CHANGED if the supplier has moved on.
    ...(termsVersion != null ? { body: { termsVersion } } : {}),
  });
}

// ── Supplier side ─────────────────────────────────────────────────────

export function fetchStoreAgreements(token: string, storeId: number): Promise<CreditAgreement[]> {
  return apiRequest<CreditAgreement[]>(
    `/api/v1/supplier-stores/${storeId}/credit/agreements`, { token });
}

export interface ApproveCreditInput {
  approvedLimit?: string;
  creditPeriodDays?: number;
  gracePeriodDays?: number;
  maxSingleOrderCredit?: string;
  maxOverdueAmount?: string;
  note?: string;
}

/**
 * Approve a request.
 *
 * <p>Sending no limit or period approves exactly what was asked for. Sending
 * either makes it a **modification**, which the restaurant has to accept before
 * the credit works — so a supplier trimming a limit is not a silent change.
 */
export function approveCredit(
  token: string,
  agreementId: number,
  input: ApproveCreditInput,
): Promise<CreditAgreement> {
  return apiRequest<CreditAgreement>(`/api/v1/credit/agreements/${agreementId}/approve`, {
    method: 'POST',
    token,
    body: input,
  });
}

export interface ModifyCreditInput {
  approvedLimit: string;
  creditPeriodDays: number;
  gracePeriodDays?: number;
  maxSingleOrderCredit?: string;
  maxOverdueAmount?: string;
  /**
   * Required by the server, not optional politeness.
   *
   * <p>Doc 01 §18: every adjustment is auditable, and an unexplained limit cut is
   * exactly what that requirement exists to stop. The restaurant sees this.
   */
  reason: string;
}

/**
 * Change the terms of a live agreement.
 *
 * <p><b>Commitments already made stand.</b> A limit cut below current exposure
 * does not claw anything back — it leaves nothing available until the outstanding
 * orders resolve, and the server refuses a cut below reserved + utilized outright
 * (D-024).
 */
export function modifyCredit(
  token: string,
  agreementId: number,
  input: ModifyCreditInput,
): Promise<CreditAgreement> {
  return apiRequest<CreditAgreement>(`/api/v1/credit/agreements/${agreementId}/modify`, {
    method: 'POST',
    token,
    body: input,
  });
}

export function rejectCredit(
  token: string,
  agreementId: number,
  reason: string,
): Promise<CreditAgreement> {
  return apiRequest<CreditAgreement>(`/api/v1/credit/agreements/${agreementId}/reject`, {
    method: 'POST',
    token,
    body: { reason },
  });
}

export function suspendCredit(
  token: string,
  agreementId: number,
  reason: string,
): Promise<CreditAgreement> {
  return apiRequest<CreditAgreement>(`/api/v1/credit/agreements/${agreementId}/suspend`, {
    method: 'POST',
    token,
    body: { reason },
  });
}

/**
 * Lift a suspension. The app asks for a reason and sends it, but today's endpoint takes no
 * body and does not store one, so the reason is not yet on the audit row (an API gap).
 */
export function reinstateCredit(
  token: string,
  agreementId: number,
  reason?: string,
): Promise<CreditAgreement> {
  return apiRequest<CreditAgreement>(`/api/v1/credit/agreements/${agreementId}/reinstate`, {
    method: 'POST',
    token,
    ...(reason != null ? { body: { reason } } : {}),
  });
}

// ── Shared ────────────────────────────────────────────────────────────

export function fetchAgreement(token: string, agreementId: number): Promise<CreditAgreement> {
  return apiRequest<CreditAgreement>(`/api/v1/credit/agreements/${agreementId}`, { token });
}

export function fetchLedger(token: string, agreementId: number): Promise<CreditLedgerEntry[]> {
  return apiRequest<CreditLedgerEntry[]>(
    `/api/v1/credit/agreements/${agreementId}/ledger`, { token });
}

export function fetchInvoices(token: string, agreementId: number): Promise<CreditInvoice[]> {
  return apiRequest<CreditInvoice[]>(
    `/api/v1/credit/agreements/${agreementId}/invoices`, { token });
}

/** Record a repayment. Requires an idempotency key — it moves money (D-065). */
export function recordPayment(
  token: string,
  invoiceId: number,
  body: { amount: string; method: string; reference?: string; note?: string },
  idempotencyKey: string,
) {
  return apiRequest(`/api/v1/credit/invoices/${invoiceId}/payments`, {
    method: 'POST',
    token,
    idempotencyKey,
    body,
  });
}

export function fetchCreditInvoice(token: string, invoiceId: number): Promise<CreditInvoiceDetail> {
  return apiRequest<CreditInvoiceDetail>(`/api/v1/credit/invoices/${invoiceId}`, { token });
}

/**
 * Newest line first. `from` and `to` are 'YYYY-MM-DD' and both optional: with
 * neither, no query string is sent and the server chooses the last 90 days.
 */
export function fetchCreditStatement(
  token: string,
  agreementId: number,
  range: { from?: string; to?: string } = {},
): Promise<CreditStatement> {
  const parts: string[] = [];
  if (range.from != null) parts.push(`from=${encodeURIComponent(range.from)}`);
  if (range.to != null) parts.push(`to=${encodeURIComponent(range.to)}`);
  const query = parts.length === 0 ? '' : `?${parts.join('&')}`;
  return apiRequest<CreditStatement>(
    `/api/v1/credit/agreements/${agreementId}/statement${query}`, { token });
}

/**
 * Tell the supplier a payment was made outside the app. Changes nothing that is
 * owed until the supplier confirms it. Needs an idempotency key (D-065).
 */
export function submitClaim(
  token: string,
  invoiceId: number,
  body: SubmitClaimRequest,
  idempotencyKey: string,
): Promise<ClaimResponse> {
  return apiRequest<ClaimResponse>(`/api/v1/credit/invoices/${invoiceId}/claims`, {
    method: 'POST',
    token,
    idempotencyKey,
    body,
  });
}

/** Take back a report the supplier has not answered yet. */
export function withdrawClaim(token: string, claimId: number): Promise<ClaimResponse> {
  return apiRequest<ClaimResponse>(`/api/v1/credit/claims/${claimId}/withdraw`, {
    method: 'POST',
    token,
  });
}

/** Every report on one agreement, newest first. */
export function fetchAgreementClaims(
  token: string,
  agreementId: number,
  status?: ClaimStatus,
): Promise<ClaimResponse[]> {
  const query = status == null ? '' : `?status=${encodeURIComponent(status)}`;
  return apiRequest<ClaimResponse[]>(
    `/api/v1/credit/agreements/${agreementId}/claims${query}`, { token });
}

/**
 * The supplier store's inbox of "I paid" reports, newest first. `status` narrows it:
 * SUBMITTED is what is waiting for the supplier.
 */
export function fetchStoreClaims(
  token: string,
  storeId: number,
  status?: ClaimStatus,
): Promise<ClaimResponse[]> {
  const query = status == null ? '' : `?status=${encodeURIComponent(status)}`;
  return apiRequest<ClaimResponse[]>(
    `/api/v1/supplier-stores/${storeId}/credit/claims${query}`, { token });
}

/**
 * The supplier says the money arrived. Leave `amount` out to confirm what was
 * claimed, which the server caps at what is outstanding now; an explicit amount
 * can be lower, never higher (`CREDIT_OVERPAYMENT`). Needs an idempotency key.
 */
export function confirmClaim(
  token: string,
  claimId: number,
  idempotencyKey: string,
  amount?: string,
): Promise<ClaimResponse> {
  return apiRequest<ClaimResponse>(`/api/v1/credit/claims/${claimId}/confirm`, {
    method: 'POST',
    token,
    idempotencyKey,
    ...(amount != null ? { body: { amount } } : {}),
  });
}

/** The supplier says the money did not arrive. A reason of 3 to 500 characters; no money moves. */
export function rejectClaim(token: string, claimId: number, reason: string): Promise<ClaimResponse> {
  return apiRequest<ClaimResponse>(`/api/v1/credit/claims/${claimId}/reject`, {
    method: 'POST',
    token,
    body: { reason },
  });
}

/** Repay from the wallet. Moves money, so it needs an idempotency key. */
export function repayFromWallet(
  token: string,
  agreementId: number,
  body: WalletRepaymentRequest,
  idempotencyKey: string,
): Promise<WalletRepayment> {
  return apiRequest<WalletRepayment>(
    `/api/v1/credit/agreements/${agreementId}/wallet-repayments`,
    { method: 'POST', token, idempotencyKey, body },
  );
}

// ── Supplier records a payment, extends a due date, closes a line (M19, M25) ──

/** What a payment of this amount would do. A pure read: nothing is written. */
export function previewPayment(
  token: string,
  agreementId: number,
  body: { amount: string; invoiceIds?: number[] },
): Promise<PaymentPreview> {
  return apiRequest<PaymentPreview>(`/api/v1/credit/agreements/${agreementId}/payments/preview`, {
    method: 'POST', token, body,
  });
}

/**
 * The supplier records money received for a line: one receipt, split over its open invoices
 * by the server. Moves debt, so it needs an idempotency key.
 */
export function recordSupplierPayment(
  token: string,
  agreementId: number,
  body: RecordPaymentBody,
  idempotencyKey: string,
): Promise<RecordedPayment> {
  return apiRequest<RecordedPayment>(`/api/v1/credit/agreements/${agreementId}/payments`, {
    method: 'POST', token, idempotencyKey, body,
  });
}

/** Move an invoice's due date later. `newDueDate` is 'YYYY-MM-DD'. Needs an idempotency key. */
export function extendInvoiceDue(
  token: string,
  invoiceId: number,
  body: { newDueDate: string; reason: string },
  idempotencyKey: string,
): Promise<ExtendDueResponse> {
  return apiRequest<ExtendDueResponse>(`/api/v1/credit/invoices/${invoiceId}/extend-due`, {
    method: 'POST', token, idempotencyKey, body,
  });
}

/** Close a line for good. The server refuses while anything is owed or on hold, in plain words. */
export function closeCredit(token: string, agreementId: number, reason: string): Promise<CreditAgreement> {
  return apiRequest<CreditAgreement>(`/api/v1/credit/agreements/${agreementId}/close`, {
    method: 'POST', token, body: { reason },
  });
}

/** The server says the reference was already recorded; its own details of the earlier one. */
export function isDuplicateReference(error: unknown): { paidOn: string | null; amount: string | null } | null {
  if (!(error instanceof ApiError) || error.code !== 'CREDIT_DUPLICATE_REFERENCE') return null;
  const d = error.details ?? {};
  return {
    paidOn: typeof d.paidOn === 'string' ? d.paidOn : null,
    amount: typeof d.amount === 'string' || typeof d.amount === 'number' ? String(d.amount) : null,
  };
}

// ── Supplier receivables (M17) ────────────────────────────────────────

/** What the store is owed, as the server worked it out. The app only formats these. */
export function fetchReceivables(token: string, storeId: number): Promise<Receivables> {
  return apiRequest<Receivables>(`/api/v1/supplier-stores/${storeId}/credit/receivables`, { token });
}

/** One page of the restaurants that owe or hold a line. `size` 20, at most 100 on the server. */
export function fetchReceivableRestaurants(
  token: string,
  storeId: number,
  params: { sort: ReceivablesSort; status?: ReceivablesStatus | null; q?: string; page: number; size: number },
): Promise<ReceivablesPage> {
  const query = new URLSearchParams({ sort: params.sort });
  if (params.status != null) query.set('status', params.status);
  if (params.q != null && params.q !== '') query.set('q', params.q);
  query.set('page', String(params.page));
  query.set('size', String(params.size));
  return apiRequest<ReceivablesPage>(
    `/api/v1/supplier-stores/${storeId}/credit/receivables/restaurants?${query.toString()}`, { token });
}

/** Open outstanding in four buckets by days past due, in India time. */
export function fetchAgeing(token: string, storeId: number): Promise<Ageing> {
  return apiRequest<Ageing>(`/api/v1/supplier-stores/${storeId}/credit/ageing`, { token });
}

/** One page of the payments made on one credit line, newest first. `size` 20 by default, at most 100. */
export function fetchAgreementPayments(
  token: string,
  agreementId: number,
  query: { page: number; size?: number },
): Promise<StorePaymentList> {
  const parts = [`page=${query.page}`];
  if (query.size != null) parts.push(`size=${query.size}`);
  return apiRequest<StorePaymentList>(
    `/api/v1/credit/agreements/${agreementId}/payments?${parts.join('&')}`, { token });
}

// ── Undo a recorded payment (M26) ─────────────────────────────────────

/** Undo a whole receipt (every invoice it paid). Moves debt, so it needs an idempotency key; `reason` is 3 to 500 characters. */
export function reverseReceipt(
  token: string, receiptId: number, reason: string, idempotencyKey: string,
): Promise<ReversalResult> {
  return apiRequest<ReversalResult>(`/api/v1/credit/receipts/${receiptId}/reverse`, {
    method: 'POST', token, idempotencyKey, body: { reason },
  });
}

/** Undo one payment that was recorded alone. Same rules as {@link reverseReceipt}. */
export function reversePayment(
  token: string, paymentId: number, reason: string, idempotencyKey: string,
): Promise<ReversalResult> {
  return apiRequest<ReversalResult>(`/api/v1/credit/payments/${paymentId}/reverse`, {
    method: 'POST', token, idempotencyKey, body: { reason },
  });
}

// ── Reminders (M26) ───────────────────────────────────────────────────

/**
 * Send a reminder. Not retried by the client: a throttle (429) is an answer to show, not to wait
 * out. A dropped connection is retried by the person with the same key.
 */
export function sendReminder(
  token: string, agreementId: number, body: { invoiceIds?: number[]; note?: string }, idempotencyKey: string,
): Promise<Reminder> {
  return apiRequest<Reminder>(`/api/v1/credit/agreements/${agreementId}/reminders`, {
    method: 'POST', token, idempotencyKey, body, retries: 0,
  });
}

/** What a reminder would say and whether it may go now. A pure read. */
export function previewReminder(
  token: string, agreementId: number, invoiceIds?: number[],
): Promise<ReminderPreview> {
  const query = invoiceIds != null && invoiceIds.length > 0 ? `?invoiceIds=${invoiceIds.join(',')}` : '';
  return apiRequest<ReminderPreview>(
    `/api/v1/credit/agreements/${agreementId}/reminders/preview${query}`, { token });
}

/** Reminders already sent to this restaurant, newest first (needs CREDIT_VIEW). */
export function fetchReminders(
  token: string, agreementId: number, query: { page: number; size?: number },
): Promise<ReminderList> {
  const parts = [`page=${query.page}`];
  if (query.size != null) parts.push(`size=${query.size}`);
  return apiRequest<ReminderList>(
    `/api/v1/credit/agreements/${agreementId}/reminders?${parts.join('&')}`, { token });
}

// ── Error helpers ─────────────────────────────────────────────────────

function numberDetail(error: unknown, code: string, key: string): number | null {
  if (!(error instanceof ApiError) || error.code !== code) return null;
  const value = error.details?.[key];
  return typeof value === 'number' ? value : null;
}

/** The wallet cannot cover the repayment: how much is missing, and what it holds. */
export function isShortBalanceError(error: unknown): { shortBy: number; balance: number } | null {
  const shortBy = numberDetail(error, 'WALLET_INSUFFICIENT_BALANCE', 'shortBy');
  const balance = numberDetail(error, 'WALLET_INSUFFICIENT_BALANCE', 'balance');
  return shortBy == null || balance == null ? null : { shortBy, balance };
}

/** The repayment is more than is owed: what is actually outstanding. */
export function isOverpaymentError(error: unknown): { outstanding: number } | null {
  const outstanding = numberDetail(error, 'CREDIT_OVERPAYMENT', 'outstanding');
  return outstanding == null ? null : { outstanding };
}

/** The report cannot be made or changed because the invoice or the report has moved on. */
export function isClaimStateError(error: unknown): boolean {
  return error instanceof ApiError
    && (error.code === 'CREDIT_CLAIM_STATE' || error.status === 404);
}

// ── Collections and payouts (supplier S8) ─────────────────────────────

/**
 * Wallet repayments Mandi collected for the store and what is paid out of them, newest
 * first, with the store's pending and this-month totals. `from` and `to` are 'YYYY-MM-DD'
 * and optional; with neither, the server applies no date limit.
 */
export function fetchPayouts(
  token: string,
  storeId: number,
  query: { status: PayoutStatusFilter; from?: string; to?: string; page: number; size: number },
): Promise<CreditPayoutList> {
  const parts = [`status=${query.status}`];
  if (query.from != null) parts.push(`from=${encodeURIComponent(query.from)}`);
  if (query.to != null) parts.push(`to=${encodeURIComponent(query.to)}`);
  parts.push(`page=${query.page}`, `size=${query.size}`);
  return apiRequest<CreditPayoutList>(
    `/api/v1/supplier-stores/${storeId}/credit/payouts?${parts.join('&')}`, { token });
}

/** Every payment on every credit line of the store, newest first. No `source` means all sources. */
export function fetchPayments(
  token: string,
  storeId: number,
  query: { source?: StorePaymentSource; from?: string; to?: string; page: number; size: number },
): Promise<StorePaymentList> {
  const parts: string[] = [];
  if (query.from != null) parts.push(`from=${encodeURIComponent(query.from)}`);
  if (query.to != null) parts.push(`to=${encodeURIComponent(query.to)}`);
  if (query.source != null) parts.push(`source=${query.source}`);
  parts.push(`page=${query.page}`, `size=${query.size}`);
  return apiRequest<StorePaymentList>(
    `/api/v1/supplier-stores/${storeId}/credit/payments?${parts.join('&')}`, { token });
}
