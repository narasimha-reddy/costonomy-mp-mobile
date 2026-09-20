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
  amount: Money;
  /** What the balance became, so a statement reads without arithmetic. */
  balanceAfter: Money;
  supplierOrderId: number | null;
  reason: string | null;
  at: string;
}
