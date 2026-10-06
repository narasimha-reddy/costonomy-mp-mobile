import { formatMoney, type Money } from '@/utils/money';

/** The "Pay another way" button, in the chosen method's words. */
export function anotherWayLabel(method: 'WALLET' | 'CREDIT', total: Money | null | undefined): string {
  const amount = total == null ? '' : ` ${formatMoney(total)}`;
  return method === 'WALLET' ? `Pay${amount} from wallet` : `Put${amount} on credit`;
}

/** Whether "Pay another way" and "Cancel order" are offered: only an unpaid card order, and never mid-payment. */
export function canPayAnotherWay(
  switchable: boolean | undefined,
  phase: 'review' | 'authorizing' | 'confirming' | 'success' | 'unknown' | 'failed' | 'ended',
): boolean {
  return switchable === true && (phase === 'review' || phase === 'failed');
}

/** What the order screen says after the switch. */
export function paidAnotherWayMessage(method: 'WALLET' | 'CREDIT'): string {
  return method === 'WALLET' ? 'Paid from your wallet.' : 'Placed on credit.';
}
