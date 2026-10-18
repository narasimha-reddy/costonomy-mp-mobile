/**
 * The one switch for settling credit OUTSIDE Mandi.
 *
 * Restaurants settle credit dues only through the three Mandi options (UPI, Card, Wallet),
 * and every paid invoice gets a transaction id. So, for now, the supplier cannot "record" a
 * payment, and a restaurant cannot report "I paid direct" (a claim) for the supplier to
 * confirm. All of that code stays in the app; only the entry points are hidden behind this
 * constant: the Record action and sheet, "Record payment for this invoice", "Record for N
 * selected", the "Recorded by you" payouts tab, and the restaurant "Paid direct" / claim
 * buttons.
 *
 * Flip to `true` when Mandi supports cash settlement of credit (a supplier recording cash
 * received, or a restaurant reporting a direct payment). History is never hidden by this
 * switch: payments already recorded stay visible in Recent payments, statements and invoice
 * detail, and claims already submitted can still be confirmed or rejected.
 */
export const MANUAL_SETTLEMENT_ENABLED = false;
