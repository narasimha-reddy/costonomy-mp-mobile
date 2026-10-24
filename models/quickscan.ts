import type { Money } from '@/utils/money';

/** QuickScan: pay a shop's UPI QR straight from the outlet wallet. Mirrors `QuickScanDtos`. */

export type QuickScanMethod = 'WALLET' | 'UPI';

/** One payment method as the config endpoint offers it: usable, or not and why. */
export interface QuickScanMethodOption {
  method: QuickScanMethod;
  available: boolean;
  /** Why it can't be used right now, e.g. "Not enough in your wallet." Null when available. */
  reason: string | null;
}

/**
 * Whether QuickScan can be offered at all, and on what terms — read before the
 * scanner ever opens, so an outlet it isn't enabled for never sees it.
 */
export interface QuickScanConfig {
  enabled: boolean;
  maxAmount: Money;
  /** The server's fee for a QuickScan payment, if any. Never added to the amount here. */
  fee: Money;
  walletBalance: Money;
  methods: QuickScanMethodOption[];
}

export type QuickScanStatus = 'PAYOUT_PENDING' | 'PAID' | 'FAILED' | 'NEEDS_REVIEW';

/** One payment: what was asked for, and where the money went. */
export interface QuickScanPayment {
  id: number;
  outletId: number;
  payeeVpa: string;
  payeeName: string | null;
  note: string | null;
  amount: Money;
  fee: Money;
  total: Money;
  method: QuickScanMethod;
  status: QuickScanStatus;
  failureReason: string | null;
  createdAt: string;
  paidAt: string | null;
}
