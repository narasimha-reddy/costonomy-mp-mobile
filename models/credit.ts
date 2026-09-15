import type { Money } from '@/utils/money';

/** Credit. Mirrors `CreditDtos` field for field (D-061). */

export type CreditAgreementStatus =
  | 'REQUESTED' | 'APPROVED' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED' | 'EXPIRED' | 'CLOSED';

export type CreditRequestStatus =
  | 'REQUESTED' | 'INFO_REQUESTED' | 'APPROVED' | 'MODIFIED' | 'REJECTED';

export type CreditTransactionType =
  | 'RESERVE' | 'UTILIZE' | 'RELEASE' | 'REPAYMENT' | 'LIMIT_CHANGE' | 'ADJUSTMENT';

export type CreditInvoiceStatus =
  | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'WRITTEN_OFF';

export interface CreditRequest {
  id: number;
  creditAgreementId: number | null;
  outletId: number;
  supplierStoreId: number;
  requestedLimit: Money;
  requestedPeriodDays: number;
  purpose: string | null;
  note: string | null;
  status: CreditRequestStatus;
  responseNote: string | null;
  respondedAt: string | null;
  createdAt: string;
}

/**
 * One supplier's credit line for one outlet.
 *
 * <p><b>`available` is the server's arithmetic, not ours.</b> §23A.24 is explicit
 * that the app must never compute `approvedLimit - reserved - utilized` itself —
 * a figure a restaurant plans an order around cannot be a client-side subtraction
 * that disagrees with what funding will actually allow.
 *
 * <p><b>`canFund` is likewise the server's answer.</b> It must not be inferred
 * from `status`: an ACTIVE agreement can still be unable to fund today.
 *
 * <p>`overdue` is a **subset** of `due`, not a separate debt. Adding them would
 * double-count, which is why neither this app nor any screen sums them.
 */
export interface CreditAgreement {
  id: number;
  outletId: number;
  outletName: string | null;
  supplierStoreId: number;
  storeName: string | null;
  supplierName: string | null;
  status: CreditAgreementStatus;
  approvedLimit: Money;
  reserved: Money;
  utilized: Money;
  available: Money;
  due: Money;
  overdue: Money;
  creditPeriodDays: number | null;
  gracePeriodDays: number | null;
  maxSingleOrderCredit: Money | null;
  termsVersion: number | null;
  effectiveFrom: string | null;
  reviewDate: string | null;
  suspensionReason: string | null;
  canFund: boolean;
  activatedAt: string | null;
  latestRequest: CreditRequest | null;
}

/** The outlet's whole position across every supplier. §23A.24, doc 05 §19. */
export interface CreditSummary {
  outletId: number;
  approvedLimit: Money;
  reserved: Money;
  utilized: Money;
  available: Money;
  due: Money;
  overdue: Money;
  agreements: CreditAgreement[];
}

export interface CreditLedgerEntry {
  id: number;
  type: CreditTransactionType;
  amount: Money;
  reservedAfter: Money;
  utilizedAfter: Money;
  availableAfter: Money;
  supplierOrderId: number | null;
  creditInvoiceId: number | null;
  description: string | null;
  createdAt: string;
}

export interface CreditInvoice {
  id: number;
  invoiceNumber: string;
  creditAgreementId: number;
  supplierOrderId: number | null;
  status: CreditInvoiceStatus;
  amount: Money;
  paidAmount: Money;
  outstanding: Money;
  dueDate: string | null;
  overdueAfter: string | null;
  issuedAt: string | null;
  settledAt: string | null;
}
