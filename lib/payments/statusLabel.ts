import type { StatusTone } from '@/components/common/MandiStatusChip';
import { formatDay } from '@/utils/dateRange';
import { formatMoney, type Money } from '@/utils/money';

/**
 * An order's payment status in the restaurant's words (API D-109).
 *
 * <p>Both inputs are the server's, read live: `status` from the order's funding
 * method (a card payment's own status, PAID / REFUNDED for a wallet, ON_CREDIT
 * for credit) and `instrument` from how the money moved. The app states nothing
 * the server has not said, and does no arithmetic: `amount` is a figure the API
 * sent, formatted and nothing more.
 *
 * <p>The rule that matters: **"not charged" is true only of a card whose hold was
 * released.** UPI, net banking, wallet apps, EMI and Pay Later debit the payer at
 * once, so a cancelled one is a refund, not a released hold. An older API sends no
 * instrument, and then nothing is claimed either.
 */

export type PaymentInstrument = 'card' | 'upi' | 'netbanking' | 'wallet' | 'emi' | 'paylater';

const INSTRUMENT_NAMES: Record<PaymentInstrument, string> = {
  upi: 'UPI',
  netbanking: 'net banking',
  wallet: 'your wallet app',
  emi: 'your EMI',
  paylater: 'Pay Later',
  card: 'your card',
};

/** How the payer paid, with its own preposition: "by UPI", "with your card". */
const PAID_PHRASES: Record<PaymentInstrument, string> = {
  upi: 'by UPI',
  netbanking: 'by net banking',
  wallet: 'with your wallet app',
  emi: 'with your EMI',
  paylater: 'with Pay Later',
  card: 'with your card',
};

/** How the payer paid, in a phrase that follows "paid by". Null when unknown. */
export function paymentInstrumentName(instrument: string | null | undefined): string | null {
  if (instrument == null) return null;
  return INSTRUMENT_NAMES[instrument as PaymentInstrument] ?? null;
}

function paidPhrase(instrument: string | null | undefined): string | null {
  if (instrument == null) return null;
  return PAID_PHRASES[instrument as PaymentInstrument] ?? null;
}

/** The only combination for which "not charged" is true. */
export function isNotCharged(
  status: string | null | undefined,
  instrument: string | null | undefined,
): boolean {
  return instrument === 'card' && status === 'RELEASED';
}

export interface PaymentStatusCopy {
  label: string;
  tone: StatusTone;
  /** A sentence saying what happened and what happens next, or null when the label is enough. */
  detail: string | null;
}

/** Shown for a status this build has not heard of: never a claim, never a crash. */
export const UNKNOWN_PAYMENT_LABEL = 'Payment status unavailable';

const LABELS = {
  CREATED: { label: 'Not paid yet', tone: 'neutral' },
  PENDING: { label: 'Not paid yet', tone: 'neutral' },
  AUTHORIZED: { label: 'Held · taken when the order is ready', tone: 'info' },
  CAPTURE_PENDING: { label: 'Being taken', tone: 'pending' },
  CAPTURED: { label: 'Paid', tone: 'success' },
  PAID: { label: 'Paid from wallet', tone: 'success' },
  ON_CREDIT: { label: 'On credit', tone: 'credit' },
  CANCEL_PENDING: { label: 'Cancelled · being settled', tone: 'pending' },
  RETURNING: { label: 'Refund on its way', tone: 'info' },
  RETURNED: { label: 'Returned by the payment provider', tone: 'neutral' },
  RETURN_DELAYED: { label: 'Refund delayed', tone: 'warning' },
  PARTIALLY_REFUNDED: { label: 'Partly refunded', tone: 'info' },
  FULLY_REFUNDED: { label: 'Refunded', tone: 'info' },
  REFUNDED: { label: 'Refunded', tone: 'info' },
  FAILED: { label: 'Payment failed', tone: 'danger' },
  EXPIRED: { label: 'Expired', tone: 'neutral' },
} satisfies Record<string, { label: string; tone: StatusTone }>;

/**
 * @param amount       what the order came to, as the API sent it; only a fallback
 * @param refundAmount the cancellation refund's own amount, number or string, as the API
 *                     sent it. When present it is the only amount shown, never `amount`
 * @param refundedAt   ISO instant the refund completed; null or unparseable leaves the date out
 * @param cancelled    the order's own status is CANCELLED; a refund is only "after a cancel" then
 */
export function paymentStatusCopy(input: {
  status: string | null | undefined;
  instrument?: string | null;
  amount?: Money | number | null;
  refundAmount?: Money | number | null;
  refundedAt?: string | null;
  cancelled?: boolean;
}): PaymentStatusCopy {
  const { status, instrument, cancelled } = input;
  const refundedOn = formatDay(input.refundedAt);
  if (!status) return { label: UNKNOWN_PAYMENT_LABEL, tone: 'neutral', detail: null };

  // The refund's own amount wins. If the API sent one we cannot read, say no
  // amount rather than fall back to the order total, which is a different figure.
  const hasRefundAmount = input.refundAmount != null && input.refundAmount !== '';
  const shown = formatMoney(hasRefundAmount ? input.refundAmount : input.amount);
  const money = shown === '—' ? null : shown;

  switch (status) {
    case 'RELEASED':
      return isNotCharged(status, instrument)
        ? { label: 'Released · not charged', tone: 'neutral', detail: null }
        // Not a card, or not known to be one: the hold may well have been a debit.
        : { label: 'Released', tone: 'neutral', detail: null };
    case 'RETURNING': {
      const how = paidPhrase(instrument);
      const paid = money == null ? 'The money you paid' : `The ${money} you paid`;
      return {
        ...LABELS.RETURNING,
        detail: how == null
          ? `Order cancelled. ${paid} is being refunded to where you paid from. It usually arrives within 5–7 working days.`
          : `Order cancelled. ${paid} ${how} is being refunded to the account you paid from. It usually arrives within 5–7 working days.`,
      };
    }
    case 'FULLY_REFUNDED':
      return {
        ...LABELS.FULLY_REFUNDED,
        detail: cancelled
          ? `${money ?? 'Your money'} was refunded to the account you paid from${refundedOn ? ` on ${refundedOn}` : ''}. Banks can take up to 5–7 working days to show it.`
          : null,
      };
    case 'RETURN_DELAYED':
      return {
        ...LABELS.RETURN_DELAYED,
        detail: `Your refund${money == null ? '' : ` of ${money}`} is taking longer than it should. Our team has been alerted and is on it. You don't need to do anything, and we'll tell you when it's sent.`,
      };
    default: {
      const known = (LABELS as Record<string, { label: string; tone: StatusTone } | undefined>)[status];
      return known != null
        ? { ...known, detail: null }
        : { label: UNKNOWN_PAYMENT_LABEL, tone: 'neutral', detail: null };
    }
  }
}

/** The chip's label alone, for rows that have no room for the sentence. */
export function paymentStatusLabel(
  status: string,
  instrument?: string | null,
): string {
  return paymentStatusCopy({ status, instrument }).label;
}

/** What a supplier reads after cancelling an order, and on a cancelled order. */
export const SUPPLIER_CANCEL_TOAST =
  "Order cancelled. The restaurant's payment is being returned to them.";
export const SUPPLIER_CANCELLED_LINE = 'Cancelled. Nothing is paid out for this order.';

/**
 * What the pay screen says when the server has closed a payment for good.
 * "No money was taken" is said only for a payment the server has not marked
 * CANCEL_PENDING: that one is not funded but may well have been debited.
 */
export function endedPaymentBody(status: string | null | undefined): string {
  return status === 'CANCEL_PENDING'
    ? "This order's payment was cancelled. If money left your account, it is being returned to where you paid from. Check Orders for where the refund has got to."
    : 'This order’s payment has closed without being paid, and no money was taken for it. Check Orders, or order again from the request.';
}
