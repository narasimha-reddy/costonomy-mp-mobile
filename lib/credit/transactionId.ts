import type { CreditPaymentSource } from '@/models/credit';

/**
 * The transaction id of a payment made through Mandi, or null when there is none to show.
 *
 * <ul>
 *   <li>UPI or Card (`ONLINE`): the Razorpay payment id the API sends as `reference` ("pay_...").
 *   <li>Wallet: the wallet ledger entry id (`walletEntryId`), the same number the restaurant sees as
 *       "Costonomy transaction ID" on the wallet transaction. Where the API sends no entry id (the
 *       supplier's payment lists) the payment's own `reference` ("credit-repayment-N") stands in.
 *   <li>A payment recorded by hand (supplier or confirmed claim) has none: its `reference` is whatever
 *       the person typed, shown as "ref ..." as before.
 * </ul>
 */
export function transactionIdOf(p: {
  source: CreditPaymentSource | string | null | undefined;
  reference?: string | null;
  walletEntryId?: number | null;
}): string | null {
  const ref = p.reference != null && p.reference.trim() !== '' ? p.reference.trim() : null;
  if (p.source === 'ONLINE') return ref;
  if (p.source === 'WALLET') return p.walletEntryId != null ? String(p.walletEntryId) : ref;
  return null;
}
