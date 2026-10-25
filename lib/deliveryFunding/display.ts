import type { DeliveryFundingLine } from '@/models/deliveryFunding';

/** How a line reads to the supplier. Words, not codes; an unknown outcome from a newer server is shown as received. */
export function outcomeLabel(outcome: string): string {
  switch (outcome) {
    case 'OWED': return 'Owed';
    case 'PAID_DIRECTLY': return 'Paid by you';
    case 'TAKEN_FROM_SETTLEMENT': return 'Taken from a payout';
    case 'WAIVED': return 'Waived';
    case 'CREDIT_WAITING_FOR_SETTLEMENT': return 'Credit coming in your next payout';
    case 'CREDITED_IN_SETTLEMENT': return 'Credited in a payout';
    default: return outcome;
  }
}

/** The chip tone for an outcome: only money still owed asks for attention. */
export function outcomeTone(outcome: string): 'warning' | 'success' | 'neutral' {
  if (outcome === 'OWED') return 'warning';
  if (outcome === 'PAID_DIRECTLY' || outcome === 'TAKEN_FROM_SETTLEMENT' || outcome === 'CREDITED_IN_SETTLEMENT') {
    return 'success';
  }
  return 'neutral';
}

/** Whether the supplier can pay this line now. The server decides; this only reads its `nextAction`. */
export function canPayNow(line: Pick<DeliveryFundingLine, 'kind' | 'nextAction'>): boolean {
  return line.kind === 'DELIVERY_FUNDING' && line.nextAction.startsWith('PAY_DIRECTLY');
}

/** What happens to a line that is owed, in a sentence. */
export function nextActionText(nextAction: string): string | null {
  switch (nextAction) {
    case 'PAY_DIRECTLY':
      return 'Pay this now. Credit orders are not settled, so there is no payout to take it from.';
    case 'PAY_DIRECTLY_OR_DEDUCTED_FROM_NEXT_SETTLEMENT':
      return 'Pay this now, or it is taken from your next payout.';
    default:
      return null;
  }
}
