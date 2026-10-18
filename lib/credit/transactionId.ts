import type { CreditPaymentSource } from '@/models/credit';

/**
 * The transaction id of a payment made through Mandi, or null when there is none to show.
 *
 * <ul>
 *   <li>The API's own `transactionId` (supplier-side payments and payouts) wins: the Razorpay payment id for
 *       UPI or Card, or for a wallet-funded payment the same number the restaurant sees. The supplier never
 *       sees a wallet named.
 *   <li>UPI or Card (`ONLINE`) without it: the Razorpay payment id the API sends as `reference` ("pay_...").
 *   <li>Wallet without it: the wallet ledger entry id (`walletEntryId`), the number the restaurant sees as
 *       "Costonomy transaction ID" on the wallet transaction. An older server's internal reference
 *       ("credit-repayment-N") is never shown as an id.
 *   <li>A payment recorded by hand (supplier or confirmed claim) has none: its `reference` is whatever
 *       the person typed, shown as "ref ..." as before.
 * </ul>
 */
export function transactionIdOf(p: {
  source: CreditPaymentSource | string | null | undefined;
  reference?: string | null;
  walletEntryId?: number | null;
  transactionId?: string | null;
}): string | null {
  const given = p.transactionId != null && p.transactionId.trim() !== '' ? p.transactionId.trim() : null;
  if (given != null && (p.source === 'ONLINE' || p.source === 'WALLET')) return given;
  const ref = p.reference != null && p.reference.trim() !== '' ? p.reference.trim() : null;
  if (p.source === 'ONLINE') return ref;
  if (p.source === 'WALLET') {
    if (p.walletEntryId != null) return String(p.walletEntryId);
    return ref != null && !/^credit-repayment-/i.test(ref) ? ref : null;
  }
  return null;
}

/** The id a payout was paid under (the API's `transactionId`), or null when there is none or the server is older. */
export function payoutTransactionId(payout: { transactionId?: string | null }): string | null {
  const id = payout.transactionId;
  return id != null && id.trim() !== '' ? id.trim() : null;
}
