import type { PaymentMethod, SupplierOrder } from '@/models/procurement';
import { formatDay } from '@/utils/dateRange';
import type { Money } from '@/utils/money';
import { paymentStatusCopy } from './statusLabel';

/**
 * The credit dates the server sends on the order (API B3). Either may be absent
 * (an older API, or no invoice raised yet); `credit` overrides the order's own.
 */
export interface CreditDates {
  creditDueDate?: string | null;
  creditSettledAt?: string | null;
}

export interface PaymentLine {
  /** The bill's final line. */
  label: string;
  /** The figure that line is for, as the server sent it: the final payable once the server has one, else the accepted amount once settled. */
  amount: Money;
  /** The sticky bar's caption. */
  barLabel: string;
  /** The label with the method spelled out ("On credit, due 7th Nov 2026"), for places with no sticky bar beside it. */
  summary: string;
}

type Input = Pick<
  SupplierOrder,
  'status' | 'paymentMethod' | 'paymentStatus' | 'totalAmount' | 'acceptedAmount'
  | 'finalPayableAmount'
> & CreditDates & { paymentInstrument?: string | null };

/**
 * What an order's payment line says, from server fields only: no arithmetic and no
 * date comparison, so a credit order is "Paid" only when the server says it was
 * settled, never because the order is complete.
 */
export function paymentLine(order: Input, credit?: CreditDates | null): PaymentLine {
  // The server's final payable wins: after a check-in refund it is what the buyer actually paid.
  const amount = order.finalPayableAmount
    ?? (order.status === 'COMPLETED' ? order.acceptedAmount : null) ?? order.totalAmount;
  const method: PaymentMethod | null = order.paymentMethod;
  const status = order.paymentStatus;
  const both = (text: string): PaymentLine => ({ label: text, amount, barLabel: text, summary: text });

  switch (method) {
    case 'PREPAID': {
      if (status === 'CAPTURED' || status === 'AUTHORIZED') {
        return { label: 'Paid', amount, barLabel: 'You paid', summary: 'Paid' };
      }
      if (order.status === 'DRAFT') return both('To pay');
      return both(paymentStatusCopy({ status, instrument: order.paymentInstrument }).label);
    }
    case 'WALLET': {
      if (status === 'PAID' || status === 'CAPTURED') {
        return { label: 'Paid from wallet', amount, barLabel: 'You paid', summary: 'Paid from wallet' };
      }
      return both(paymentStatusCopy({ status, instrument: order.paymentInstrument }).label);
    }
    case 'CREDIT': {
      const settledAt = credit?.creditSettledAt ?? order.creditSettledAt;
      if (settledAt != null) {
        const settledOn = formatDay(settledAt);
        const text = settledOn == null ? 'Paid on credit' : `Paid on ${settledOn}`;
        return { label: text, amount, barLabel: 'Paid on credit', summary: text };
      }
      const dueOn = formatDay(credit?.creditDueDate ?? order.creditDueDate);
      // The bill's line is "Due 7th Nov 2026": "On credit" is already said by the sticky bar beside it.
      return {
        label: dueOn == null ? 'On credit' : `Due ${dueOn}`,
        amount,
        barLabel: 'On credit',
        summary: dueOn == null ? 'On credit' : `On credit, due ${dueOn}`,
      };
    }
    default:
      return both('Total');
  }
}
