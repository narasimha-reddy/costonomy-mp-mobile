import { istDayTime } from '@/lib/credit/istFormat';
import type { CreditPayAttempt } from '@/models/creditPay';
import { formatMoney, type Money } from '@/utils/money';

/**
 * The words of the pay-credit flow (contract section 4.6), sentence case. Amounts are
 * the server's, formatted only; nothing here adds or compares money.
 */
export const PAY_DUES = 'Pay dues';
export const CHOOSE_INVOICES = 'Choose invoices to pay';
export const FLAG_OFF_TEXT = "Paying online isn't available yet.";
export const OFFLINE_TEXT = "You're offline. Connect to pay.";
export const WALLET_ON_HOLD_TEXT = 'Your wallet is on hold. Please contact support.';
export const BELOW_MINIMUM_TEXT = "Online payments start at ₹1. Pay this from your wallet.";
export const CHANGED_TOAST = "Some invoices changed. We've updated the list.";
export const SIGN_IN_AGAIN = 'Please sign in again.';
export const START_FAILED_TEXT = 'Could not start the payment. Check your connection and try again.';

export const PENDING_TITLE = "We're confirming your payment";
export const PENDING_BODY =
  "This can take a few minutes. Your invoices will be settled as soon as it clears. Please don't pay again.";
export const PENDING_LATER = "We'll update this when it clears.";
export const PAID_TITLE = 'Paid. Invoices settled.';
export const REFUNDED_TITLE = 'Your money is on its way back';
export const ENDED_TEXT = "This payment wasn't completed. Nothing was charged.";
export const DECLINED_TEXT = "That payment didn't go through. Nothing was charged.";

export const barCountText = (n: number): string => (n === 1 ? '1 invoice' : `${n} invoices`);
export const limitText = (max: number): string => `Choose at most ${max} invoices at a time.`;
export const supplierAllLabel = (name: string): string => `Select all invoices from ${name}`;
export const methodSheetTitle = (amount: Money): string => `Pay ${formatMoney(amount)}`;
export const walletBalanceText = (balance: Money | null): string => `Balance ${formatMoney(balance)}`;
export const walletShortText = (shortBy: Money | null): string => `Wallet is ${formatMoney(shortBy)} short`;
export const feeText = (fee: Money): string => `Includes a ${formatMoney(fee)} payment fee`;
export const paidBody = (amount: Money, n: number): string =>
  `${formatMoney(amount)} paid for ${n === 1 ? '1 invoice' : `${n} invoices`}.`;

/** Why a method cannot be used, in words; null when it can or the reason is not one we word. */
export function unavailableText(reason: string | null, shortBy: Money | null): string | null {
  switch (reason) {
    case 'BELOW_MINIMUM': return BELOW_MINIMUM_TEXT;
    case 'WALLET_ON_HOLD': return WALLET_ON_HOLD_TEXT;
    case 'WALLET_SHORT': return walletShortText(shortBy);
    case 'ONLINE_OFF': return FLAG_OFF_TEXT;
    case 'WALLET_OFF': return "Paying from your wallet isn't available yet.";
    default: return null;
  }
}

/** How the payment was made, for the receipt: "UPI", "Card", "Wallet", "Net banking". */
export function paidByLabel(paidWith: string | null, method: string): string {
  switch (paidWith ?? method) {
    case 'UPI': return 'UPI';
    case 'CARD': return 'Card';
    case 'WALLET': return 'Wallet';
    case 'NETBANKING': return 'Net banking';
    case 'PROVIDER_WALLET': return 'Wallet app';
    case 'EMI': return 'EMI';
    default: return 'Online';
  }
}

/** "your {x}" in the refund sentences: where the money goes back to. */
export function refundTarget(attempt: Pick<CreditPayAttempt, 'paidWith' | 'method'>): string {
  switch (attempt.paidWith ?? attempt.method) {
    case 'UPI': return 'UPI';
    case 'CARD': return 'card';
    case 'NETBANKING': return 'bank account';
    default: return 'original payment method';
  }
}

export function skippedCount(attempt: CreditPayAttempt): number {
  return attempt.invoices.filter((i) => i.outcome === 'SKIPPED').length;
}

export function refundBannerText(attempt: CreditPayAttempt): string {
  const target = refundTarget(attempt);
  if (attempt.refundState === 'COMPLETED') return `${formatMoney(attempt.refundAmount)} has been returned to your ${target}.`;
  const k = skippedCount(attempt);
  const changed = k === 1 ? '1 invoice changed' : `${k} invoices changed`;
  return `${formatMoney(attempt.refundAmount)} is going back to your ${target}. ${changed} before your payment arrived, so we didn't pay them twice.`;
}

export function refundedBody(attempt: CreditPayAttempt): string {
  const target = refundTarget(attempt);
  if (attempt.refundState === 'COMPLETED') return `${formatMoney(attempt.refundAmount)} has been returned to your ${target}.`;
  return `These invoices changed before your payment arrived, so nothing was paid. ${formatMoney(attempt.refundAmount)} is going back to your ${target}.`;
}

export function receiptFooter(attempt: CreditPayAttempt): string {
  const by = `Paid by ${paidByLabel(attempt.paidWith, attempt.method)}`;
  const when = istDayTime(attempt.paidAt);
  return when == null ? by : `${by} · ${when}`;
}

/** Above the bar when a chosen invoice has a "Paid direct" report still waiting. `waiting` is a display sum. */
export const doublePayText = (waiting: Money | null): string =>
  `You told a supplier you paid ${waiting == null ? 'something' : formatMoney(waiting)} directly, and they haven't confirmed it yet. If you also pay here, you may pay twice.`;
