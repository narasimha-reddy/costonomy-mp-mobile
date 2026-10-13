import type { Money } from '@/utils/money';
export type CreditPayMethod = 'UPI' | 'CARD' | 'WALLET';
export type CreditPayAttemptStatus = 'CREATED' | 'PAID' | 'FAILED' | 'EXPIRED' | 'REFUNDED';
export type CreditPayRefundState = 'NONE' | 'PENDING' | 'COMPLETED' | 'NEEDS_ATTENTION';
export type CreditPayOutcome = 'PENDING' | 'PAID' | 'SKIPPED';
export type CreditPaySkipReason = 'SETTLED' | 'WRITTEN_OFF' | 'AMOUNT_CHANGED' | 'SUPPLIER_UNAVAILABLE';
export type MethodUnavailableReason = 'ONLINE_OFF' | 'BELOW_MINIMUM' | 'WALLET_OFF' | 'WALLET_ON_HOLD' | 'WALLET_SHORT';
export interface PayableInvoice { invoiceId: number; invoiceNumber: string; supplierOrderId: number | null; status: string;
  amount: Money; paidAmount: Money; creditedAmount: Money; outstanding: Money; dueDate: string; overdueAfter: string | null;
  dueState: string; daysToDue: number | null; openClaimsAmount: Money; }
export interface PayableSupplier { agreementId: number; supplierStoreId: number; supplierName: string; storeName: string | null;
  agreementStatus: string; payable: boolean; notPayableReason: string | null; due: Money; overdue: Money; invoices: PayableInvoice[]; }
export interface PayableInvoices { outletId: number; onlinePayEnabled: boolean; walletPayEnabled: boolean; methods: CreditPayMethod[];
  feePercent: Money; minOnlineAmount: Money; maxInvoices: number; suppliers: PayableSupplier[]; }
export interface PayItem { invoiceId: number; outstanding: Money; }   // outstanding copied verbatim from PayableInvoice
export interface MethodQuote { method: CreditPayMethod; available: boolean; unavailableReason: MethodUnavailableReason | null;
  feeAmount: Money; totalCharged: Money; shortBy: Money | null; }
export interface CreditPayQuote { invoiceCount: number; supplierCount: number; amount: Money; walletBalance: Money | null; methods: MethodQuote[]; }
export interface AttemptInvoice { invoiceId: number; invoiceNumber: string; agreementId: number; supplierStoreId: number;
  supplierName: string; amount: Money; outcome: CreditPayOutcome; skipReason: CreditPaySkipReason | null; }
export interface AttemptSupplier { agreementId: number; supplierStoreId: number; supplierName: string; invoiceCount: number;
  amount: Money; paidAmount: Money; repaymentId: number | null;
  agreement: { due: Money; overdue: Money; available: Money; status: string } | null; }
export interface CreditPayAttempt { attemptId: number; outletId: number; status: CreditPayAttemptStatus; method: CreditPayMethod;
  paidWith: string | null; paymentDetail: string | null; invoiceCount: number; amount: Money; feeAmount: Money; totalCharged: Money;
  currency: string; razorpayOrderId: string | null; razorpayPaymentId: string | null; keyId: string | null; reopened: boolean;
  refundAmount: Money; refundState: CreditPayRefundState; createdAt: string; paidAt: string | null; expiresAt: string | null;
  walletBalanceAfter: Money | null; suppliers: AttemptSupplier[]; invoices: AttemptInvoice[];
  /** The wallet ledger entry of a settled WALLET payment (the id the wallet screen shows); absent or null otherwise. */
  walletEntryId?: number | null; }
/** Reads the summary's flag defensively: an older server has no field, which means off. */
export function isOnlinePayOn(summary: { onlinePayEnabled?: boolean } | null | undefined): boolean {
  return summary?.onlinePayEnabled === true;
}
