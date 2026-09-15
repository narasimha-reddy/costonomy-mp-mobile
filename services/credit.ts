import { apiRequest } from '@/lib/api/client';
import type {
  CreditAgreement,
  CreditInvoice,
  CreditLedgerEntry,
  CreditSummary,
} from '@/models/credit';

// ── Restaurant side ───────────────────────────────────────────────────

/** The outlet's whole credit position across every supplier. Doc 05 §19. */
export function fetchCreditSummary(token: string, outletId: number): Promise<CreditSummary> {
  return apiRequest<CreditSummary>(`/api/v1/outlets/${outletId}/credit/summary`, { token });
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
 * it must never be sent automatically on the restaurant's behalf.
 */
export function acceptAgreement(token: string, agreementId: number): Promise<CreditAgreement> {
  return apiRequest<CreditAgreement>(`/api/v1/credit/agreements/${agreementId}/accept`, {
    method: 'POST',
    token,
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

export function reinstateCredit(token: string, agreementId: number): Promise<CreditAgreement> {
  return apiRequest<CreditAgreement>(`/api/v1/credit/agreements/${agreementId}/reinstate`, {
    method: 'POST',
    token,
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
