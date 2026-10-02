/**
 * An order's payment status in the restaurant's words.
 *
 * <p>The value is the server's, read live from the order's funding method: a
 * card payment's own status, PAID / PARTIALLY_REFUNDED / REFUNDED for a wallet,
 * ON_CREDIT for credit. "Authorized" and "Captured" are the payment industry's
 * words; what a restaurant wants to know is whether the money is held, taken,
 * given back or never charged.
 */
const LABELS: Record<string, string> = {
  CREATED: 'Not paid yet',
  PENDING: 'Not paid yet',
  AUTHORIZED: 'Held · taken when the order is ready',
  CAPTURE_PENDING: 'Being taken',
  CAPTURED: 'Paid',
  PAID: 'Paid from wallet',
  ON_CREDIT: 'On credit',
  RELEASED: 'Released · not charged',
  PARTIALLY_REFUNDED: 'Partly refunded',
  FULLY_REFUNDED: 'Refunded',
  REFUNDED: 'Refunded',
  FAILED: 'Payment failed',
  EXPIRED: 'Expired',
};

export function paymentStatusLabel(status: string): string {
  const known = LABELS[status];
  if (known != null) return known;
  const spaced = status.replace(/_/g, ' ').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
