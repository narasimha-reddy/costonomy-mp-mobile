/**
 * What the pay screen may say, decided only by what the server said.
 *
 * <p>A client callback is not financial truth (doc 05 §14). Three outcomes, each
 * from the server's payment:
 *
 * - `paid` — `fundsSecured`. The supplier has the order.
 * - `retry` — not funded, and still payable: a declined attempt, a closed window.
 *   The same Razorpay order takes another attempt, so trying again is safe.
 * - `ended` — not funded and not payable: the payment is over (expired, failed for
 *   good). Offering "Try again" here opened a checkout the server would ignore,
 *   and a customer could authorise money that no order would ever take.
 *
 * `status` alone is not enough: anything but FAILED used to count as success,
 * so a payment still CREATED showed "Payment authorised".
 */
export type PayOutcome = 'paid' | 'retry' | 'ended';

export function payOutcome(payment: {
  fundsSecured: boolean;
  status: string;
  payable?: boolean;
}): PayOutcome {
  if (payment.fundsSecured) return 'paid';
  // `payable` comes from the intent lookup; a confirm response has no such
  // field, and there CREATED is what "still payable" means.
  const payable = payment.payable ?? payment.status === 'CREATED';
  return payable ? 'retry' : 'ended';
}
