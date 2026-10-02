import type { DisputeRefund } from '@/models/trust';
import type { StatusTone } from '@/components/common/MandiStatusChip';
import { formatMoney } from '@/utils/money';
import { OPS_TEAM } from '@/lib/brand';

export type RefundViewer = 'restaurant' | 'supplier';

export interface RefundCopy {
  /** The chip. */
  label: string;
  tone: StatusTone;
  /** One sentence saying what happened and what happens next. */
  detail: string;
  /** Whether this viewer has something to do. */
  actionable: boolean;
}

/**
 * What a refund request means, to whoever is looking at it (API D-104).
 *
 * <p>The status is the server's. The one thing read from the clock is whether the
 * supplier's 48 hours have passed, and even that is the server's deadline against
 * the server's clock ({@code now} is `serverNow()`), never a duration counted here.
 *
 * <p>Every sentence says whose money it is. For the supplier an approval is money
 * out of their payout, and the screen must not let them learn that afterwards.
 */
export function refundCopy(refund: DisputeRefund, viewer: RefundViewer, now: number): RefundCopy {
  const amount = formatMoney(refund.amount);
  const answerBy = refund.supplierAnswerBy == null ? null : Date.parse(refund.supplierAnswerBy);
  const overdue = answerBy != null && now >= answerBy;

  if (viewer === 'restaurant') {
    switch (refund.status) {
      case 'REQUESTED':
        return overdue
          ? { label: `With ${OPS_TEAM}`, tone: 'pending', actionable: false,
            detail: `You asked for ${amount}. The supplier didn't answer in time, so ${OPS_TEAM} will decide.` }
          : { label: 'Waiting for the supplier', tone: 'pending', actionable: false,
            detail: `You asked for ${amount}. If the supplier doesn't answer in 48 hours, ${OPS_TEAM} will decide.` };
      case 'APPROVED':
        return { label: 'Refunded to your wallet', tone: 'success', actionable: false,
          detail: `The supplier approved it. ${amount} was added to your wallet.` };
      case 'DECLINED':
        return { label: `Declined · with ${OPS_TEAM}`, tone: 'warning', actionable: false,
          detail: `The supplier declined${quote(refund.supplierNote)}. ${OPS_TEAM} will look at it.` };
      case 'OPS_APPROVED':
        return { label: 'Refunded to your wallet', tone: 'success', actionable: false,
          detail: `${OPS_TEAM} approved it. ${amount} was added to your wallet.` };
      case 'OPS_DECLINED':
        return { label: 'Declined', tone: 'danger', actionable: false,
          detail: `${OPS_TEAM} declined it${quote(refund.opsNote)}.` };
    }
  }

  switch (refund.status) {
    case 'REQUESTED':
      return { label: 'Needs your answer', tone: overdue ? 'danger' : 'warning', actionable: true,
        detail: overdue
          ? `The restaurant asked for ${amount}. Your 48 hours have passed; you can still answer until ${OPS_TEAM} decides.`
          : `The restaurant asked for ${amount}. If you approve, it is taken from your payout for this order.` };
    case 'APPROVED':
      return { label: 'You approved it', tone: 'success', actionable: false,
        detail: `${amount} is taken from your payout for this order.` };
    case 'DECLINED':
      return { label: `Declined · with ${OPS_TEAM}`, tone: 'pending', actionable: false,
        detail: `You declined${quote(refund.supplierNote)}. ${OPS_TEAM} will decide.` };
    case 'OPS_APPROVED':
      return { label: `Approved by ${OPS_TEAM}`, tone: 'warning', actionable: false,
        detail: `${OPS_TEAM} approved it${quote(refund.opsNote)}. ${amount} is taken from your payout for this order.` };
    case 'OPS_DECLINED':
      return { label: `Declined by ${OPS_TEAM}`, tone: 'neutral', actionable: false,
        detail: `${OPS_TEAM} declined it${quote(refund.opsNote)}. Nothing is taken from your payout.` };
  }
}

function quote(note: string | null): string {
  return note == null || note.trim() === '' ? '' : `: “${note.trim()}”`;
}

/**
 * Whether an amount typed into the form is one the server could accept: digits,
 * at most two decimals, more than zero. Shape only — the ceiling is the server's
 * (`fetchRefundLimit`), and it checks again when asked.
 */
export function isAmount(text: string): boolean {
  return /^\d{1,13}(\.\d{1,2})?$/.test(text.trim()) && Number(text) > 0;
}
