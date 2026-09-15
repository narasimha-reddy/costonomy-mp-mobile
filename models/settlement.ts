import type { Money } from '@/utils/money';

/** Settlements. Mirrors `SettlementDtos` field for field (D-061). */

export type SettlementStatus =
  | 'PENDING' | 'CALCULATED' | 'APPROVED' | 'PROCESSING' | 'PAID' | 'FAILED';

/**
 * One order's contribution to a payout.
 *
 * <p><b>`ratePercent` is the rate that applied when this was calculated</b>, not
 * the current one — doc 05 §33 and D-053. A historical settlement must not move
 * because someone changed a commission rate today, so the screen renders the
 * snapshot and never recomputes from configuration.
 */
export interface SettlementLine {
  supplierOrderId: number;
  orderNumber: string;
  grossAmount: Money;
  ratePercent: Money;
  commissionAmount: Money;
  netAmount: Money;
  calculatedAt: string;
}

export interface SettlementAdjustment {
  id: number;
  direction: 'CREDIT' | 'DEBIT';
  amount: Money;
  reasonCode: string;
  reason: string;
  supplierOrderId: number | null;
  createdAt: string;
}

export interface Settlement {
  id: number;
  settlementNumber: string;
  supplierStoreId: number;
  status: SettlementStatus;
  periodStart: string;
  periodEnd: string;
  settlementDate: string | null;
  grossAmount: Money;
  commissionAmount: Money;
  adjustmentAmount: Money;
  netAmount: Money;
  orderCount: number;
  approvedAt: string | null;
  paidAt: string | null;
  paymentReference: string | null;
  failureReason: string | null;
  lines: SettlementLine[];
  adjustments: SettlementAdjustment[];
}
