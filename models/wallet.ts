import type { Money } from '@/utils/money';

/**
 * An outlet's prepaid balance. The third way to fund an order, alongside a card
 * and a supplier's credit.
 *
 * <p>The difference that matters to the screen: a wallet settles inside the
 * order's own creation, so there is no checkout to complete afterwards. What it
 * shares with credit is that it can be short — and unlike a declined card,
 * being short is something the restaurant can do something about.
 */
export interface Wallet {
  outletId: number;
  balance: Money;
  currency: string;
  status: string;
  recent: WalletEntry[];
}

export type WalletDirection = 'DEBIT' | 'CREDIT';

/**
 * One movement, from the wallet's point of view.
 *
 * <p>`DEBIT` is money leaving to pay for an order — the opposite of how a
 * restaurant would say it, and not the same "credit" as a supplier's terms.
 */
export interface WalletEntry {
  id: number;
  direction: WalletDirection;
  /** Why it moved (API D-104). */
  kind: WalletEntryKind;
  amount: Money;
  /** What the balance became, so a statement reads without arithmetic. */
  balanceAfter: Money;
  supplierOrderId: number | null;
  reason: string | null;
  /**
   * For a withdrawal: where its refund to the card has got to. `NEEDS_REVIEW`
   * means it could not finish and Mandi's team has it. Null for other kinds.
   */
  refundStatus: WithdrawalRefundStatus | string | null;
  at: string;
}

/**
 * The kinds this app knows. A newer API may send others: every reader must cope
 * with a value that is not listed (see `entryLabel`).
 */
export type WalletEntryKind =
  | 'TOP_UP' | 'ORDER_PAYMENT' | 'ORDER_REFUND' | 'REFUND' | 'WITHDRAWAL' | 'DISPUTE_REFUND'
  /** A withdrawal the provider refused, put back in the wallet (API D-110). A credit. */
  | 'WITHDRAWAL_REVERSAL';

/** Where a withdrawal's refund has got to. `REJECTED`/`REVERSED` need API D-110. */
export type WithdrawalRefundStatus =
  | 'REQUESTED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'NEEDS_REVIEW' | 'REJECTED' | 'REVERSED';

/** Why a withdrawal above what can go back was refused (API D-110). */
export type WithdrawalRefusalReason = 'SOURCE_BLOCKED' | 'PROVIDER_UNREACHABLE' | 'NO_REFUND_MONEY';

/** One payment's share of a withdrawal: a refund to that payment's card. */
export interface WithdrawalPart {
  refundId: number;
  paymentId: number;
  amount: Money;
  status: string;
}

export interface Withdrawal {
  outletId: number;
  amount: Money;
  balance: Money;
  parts: WithdrawalPart[];
}
