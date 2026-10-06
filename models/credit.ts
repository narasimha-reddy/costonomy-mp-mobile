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

export type CreditDueState =
  | 'PAID' | 'WRITTEN_OFF' | 'OVERDUE' | 'IN_GRACE' | 'DUE_TODAY' | 'DUE_SOON' | 'DUE_LATER';

export type CreditPaymentSource = 'SUPPLIER_RECORDED' | 'WALLET' | 'CLAIM_CONFIRMED';

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
  /**
   * Who and where, in the shape an order card already uses. A supplier deciding
   * on credit is deciding about a restaurant, and the outlet's own name —
   * whatever they chose to call it — does not say who is asking or how far away.
   */
  restaurantName: string | null;
  outletLocality: string | null;
  outletCity: string | null;
  distanceKm: Money | null;
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
  /** Earliest open due date, 'YYYY-MM-DD'. Absent on older payloads. */
  nextDueDate?: string | null;
  nextDueAmount?: Money | null;
  openInvoices?: number;
  /** Payments the restaurant reported that the supplier has not answered yet. 0 when none. */
  openClaimsAmount?: Money;
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
  /**
   * What can still be reported with "Paid direct": still owed minus reports already
   * waiting for the supplier. Absent on older payloads.
   */
  reportableAmount?: number;
  /**
   * Who suspended the line. The API does not send these three yet, so they are optional
   * and the screen shows them only when present: SYSTEM is the overdue sweep, SUPPLIER a
   * person. `maxOverdueAmount` is the auto-pause threshold; `minLimit` is the lowest limit
   * the server will accept (reserved + utilized).
   */
  suspensionSource?: 'SYSTEM' | 'SUPPLIER' | null;
  maxOverdueAmount?: Money | null;
  minLimit?: Money | null;
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
  /** Whether repaying from the wallet is switched on. Absent means off. */
  walletRepayEnabled?: boolean;
  /**
   * What can still be reported with "Paid direct": still owed minus reports already
   * waiting for the supplier. Absent on older payloads.
   */
  reportableAmount?: number;
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
  /** The server's due classification; absent on older payloads. */
  dueState?: CreditDueState;
  /** Negative once past due, null when settled. The app never computes it. */
  daysToDue?: number | null;
  /**
   * What can still be reported with "Paid direct": still owed minus reports already
   * waiting for the supplier. Absent on older payloads.
   */
  reportableAmount?: number;
}

/** Whether anything needs attention. Deliberately no amounts. */
export interface CreditAttention {
  overdue: boolean;
  dueSoon: boolean;
}

export interface CreditInvoicePayment {
  id: number;
  amount: Money;
  source: CreditPaymentSource;
  method: string | null;
  reference: string | null;
  paidAt: string;
  walletEntryId: number | null;
}

/** GET /api/v1/credit/invoices/{id}. */
export interface CreditInvoiceDetail {
  id: number;
  invoiceNumber: string;
  agreementId: number;
  supplierOrderId: number | null;
  status: CreditInvoiceStatus;
  amount: Money;
  paidAmount: Money;
  outstanding: Money;
  dueDate: string | null;
  overdueAfter: string | null;
  issuedAt: string | null;
  settledAt: string | null;
  dueState: CreditDueState;
  daysToDue: number | null;
  orderNumber: string | null;
  supplierName: string | null;
  storeName: string | null;
  payments: CreditInvoicePayment[];
  /** The restaurant's "Paid direct" reports on this invoice, newest first. Absent on older payloads. */
  claims?: ClaimResponse[];
  /**
   * What can still be reported with "Paid direct": still owed minus reports already
   * waiting for the supplier. Absent on older payloads.
   */
  reportableAmount?: number;
}

export type ClaimMethod = 'BANK_TRANSFER' | 'UPI' | 'CASH' | 'CHEQUE' | 'CARD';
/**
 * SUPERSEDED: the invoice was settled before the supplier confirmed this report,
 * so it is not needed any more (its `decisionNote` says so). Never "waiting".
 */
export type ClaimStatus = 'SUBMITTED' | 'CONFIRMED' | 'REJECTED' | 'WITHDRAWN' | 'SUPERSEDED';

/** A restaurant's report that it paid a supplier outside the app. */
export interface ClaimResponse {
  id: number;
  invoiceId: number;
  invoiceNumber: string;
  agreementId: number;
  outletId: number;
  outletName: string | null;
  restaurantName: string | null;
  amount: Money;
  method: ClaimMethod;
  reference: string | null;
  /** 'YYYY-MM-DD'. */
  paidOn: string;
  note: string | null;
  status: ClaimStatus;
  decisionNote: string | null;
  confirmedAmount: Money | null;
  creditPaymentId: number | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface SubmitClaimRequest {
  /** At most 2 decimals, at least 1. */
  amount: number;
  method: ClaimMethod;
  /** Required unless the method is CASH. At most 200 characters. */
  reference?: string;
  /** 'YYYY-MM-DD', India time; not in the future. */
  paidOn: string;
  note?: string;
}

export interface CreditStatementLine {
  at: string;
  type: string;
  label: string;
  /** Signed. */
  amount: Money;
  owedAfter: Money;
  supplierOrderId: number | null;
  orderNumber: string | null;
  creditInvoiceId: number | null;
  invoiceNumber: string | null;
  source: CreditPaymentSource | null;
  method: string | null;
  reference: string | null;
  walletEntryId: number | null;
}

/** Newest line first. */
export interface CreditStatement {
  agreementId: number;
  from: string;
  to: string;
  openingOwed: Money;
  closingOwed: Money;
  lines: CreditStatementLine[];
}

export interface WalletRepaymentRequest {
  /** At most 2 decimals, at least 1. */
  amount: number;
  invoiceIds?: number[];
}

export interface WalletRepaymentAllocation {
  invoiceId: number;
  invoiceNumber: string;
  amount: Money;
  statusAfter: CreditInvoiceStatus;
}

export interface WalletRepayment {
  repaymentId: number;
  amount: Money;
  walletEntryId: number;
  walletBalanceAfter: Money;
  allocations: WalletRepaymentAllocation[];
  agreement: { due: Money; overdue: Money; available: Money; status: CreditAgreementStatus };
}

// ── Collections and payouts (supplier S8) ─────────────────────────────

export type PayoutStatus = 'PENDING' | 'APPLIED';
export type PayoutStatusFilter = 'ALL' | PayoutStatus;

export interface CreditPayoutInvoice {
  invoiceId: number;
  invoiceNumber: string;
  amount: Money;
}

/** Money a restaurant paid from its Mandi wallet, and what Mandi pays the supplier of it. All figures are the server's. */
export interface CreditPayout {
  payoutId: number;
  repaymentId: number;
  agreementId: number;
  outletId: number;
  outletName: string | null;
  restaurantName: string | null;
  grossAmount: Money;
  /** The rate in force when it was paid; null when none applied. */
  commissionRatePercent: Money | null;
  commissionAmount: Money;
  netAmount: Money;
  status: PayoutStatus;
  settlementId: number | null;
  settlementNumber: string | null;
  settlementDate: string | null;
  appliedAt: string | null;
  createdAt: string;
  invoices: CreditPayoutInvoice[];
}

export interface CreditPayoutList {
  summary: { pendingNet: Money; appliedNetThisMonth: Money };
  items: CreditPayout[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
}

export type StorePaymentSource = 'SUPPLIER_RECORDED' | 'WALLET' | 'CLAIM_CONFIRMED';

/** One payment on any of the store's credit lines. */
export interface StorePayment {
  id: number;
  paidAt: string;
  paidOn: string;
  agreementId: number;
  outletId: number;
  outletName: string | null;
  restaurantName: string | null;
  invoiceId: number;
  invoiceNumber: string;
  amount: Money;
  source: StorePaymentSource;
  method: string | null;
  reference: string | null;
}

export interface StorePaymentList {
  items: StorePayment[];
  page: number;
  size: number;
  total: number;
  hasNext: boolean;
}


// ── Supplier receivables (M17). Mirrors CreditDtos "supplier's receivables". ──
// Amounts arrive as JSON numbers; they are only ever formatted, never added.

export type ReceivablesSort = 'overdue' | 'owed' | 'nextDue';
export type ReceivablesStatus = 'ACTIVE' | 'SUSPENDED';
export type PendingActionKind =
  | 'CLAIMS_WAITING' | 'REQUESTS_PENDING' | 'OVERDUE_RESTAURANTS' | 'LINE_AT_LIMIT';

export interface PendingAction {
  kind: PendingActionKind;
  count: number;
}

export interface Receivables {
  asOf: string;
  totalReceivable: number;
  overdue: number;
  inGrace: number;
  dueToday: number;
  dueThisWeek: number;
  collectedThisMonth: number;
  exposure: { extended: number; drawn: number; availableToLend: number };
  counts: {
    restaurants: number;
    linesActive: number;
    linesSuspended: number;
    requestsPending: number;
    claimsWaiting: number;
    overdueRestaurants: number;
  };
  pendingActions: PendingAction[];
}

export interface ReceivableRestaurant {
  agreementId: number;
  outletId: number;
  outletName: string | null;
  restaurantName: string | null;
  status: CreditAgreementStatus;
  owed: number;
  overdue: number;
  nextDueAmount: number | null;
  nextDueDate: string | null;
  dueState: CreditDueState | null;
  claimsWaiting: number;
  limit: number;
  utilized: number;
  /** Percent of the limit drawn, one decimal; null when the limit is zero. */
  utilization: number | null;
}

export interface ReceivablesPage {
  items: ReceivableRestaurant[];
  page: number;
  size: number;
  total: number;
  hasNext: boolean;
}

export type AgeingBucketKey = 'CURRENT' | 'D1_7' | 'D8_30' | 'D30_PLUS';

export interface AgeingBucketRestaurant {
  agreementId: number;
  outletName: string | null;
  restaurantName: string | null;
  amount: number;
  invoiceCount: number;
}

export interface AgeingBucket {
  bucket: AgeingBucketKey;
  amount: number;
  invoiceCount: number;
  restaurantCount: number;
  topRestaurants: AgeingBucketRestaurant[];
}

export interface Ageing {
  asOf: string;
  total: number;
  buckets: AgeingBucket[];
}
