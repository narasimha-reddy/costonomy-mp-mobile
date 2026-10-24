import type { QuickScanPayment } from '@/models/quickscan';
import { formatMoney } from '@/utils/money';
import { formatMomentWithRecency } from '@/utils/dateRange';
import { OPS_TEAM } from '@/lib/brand';

/** What the result screen says, and whether it should keep polling. */
export interface QuickScanStatusCopy {
  title: string;
  detail: string | null;
  /** Whether `[id].tsx` should keep polling — true only for `PAYOUT_PENDING`. */
  polling: boolean;
}

/** The payee, in one word if the QR didn't carry a name. */
function payeeLabel(payment: QuickScanPayment): string {
  return payment.payeeName ?? 'the UPI ID';
}

/**
 * The status → copy mapping for QuickScan's result screen (REST-QUICKSCAN-03).
 *
 * <p>The status is the server's, always — this only chooses words for it.
 * `PAYOUT_PENDING` is the one state worth polling on: everything else is
 * terminal, and the caller stops asking once it sees one.
 */
export function quickScanStatusCopy(payment: QuickScanPayment): QuickScanStatusCopy {
  const amount = formatMoney(payment.amount);
  const who = payeeLabel(payment);

  switch (payment.status) {
    case 'PAYOUT_PENDING':
      return {
        title: `Sending ${amount} to ${who}…`,
        detail: null,
        polling: true,
      };
    case 'PAID':
      return {
        title: `Paid ${amount} to ${who}`,
        detail: payment.paidAt != null ? formatMomentWithRecency(payment.paidAt) : null,
        polling: false,
      };
    case 'FAILED':
      return {
        title: `Payment didn’t go through — ${amount} is back in your wallet`,
        detail: payment.failureReason,
        polling: false,
      };
    case 'NEEDS_REVIEW':
      return {
        title: `We’re checking this payment — ${OPS_TEAM} has it`,
        detail: null,
        polling: false,
      };
    default:
      return { title: `Sending ${amount} to ${who}…`, detail: null, polling: true };
  }
}
