import type { WalletEntry } from '@/models/wallet';
import type { StatusTone } from '@/components/common/MandiStatusChip';
import { OPS_TEAM } from '@/lib/brand';

/** What a statement row says it was. The server's kind, in the restaurant's words. */
export function entryLabel(entry: WalletEntry): string {
  switch (entry.kind) {
    case 'TOP_UP': return 'Money added';
    case 'ORDER_PAYMENT': return 'Paid for an order';
    case 'ORDER_REFUND': return 'Order cancelled · money back';
    case 'REFUND': return 'Refund';
    case 'DISPUTE_REFUND': return 'Refund';
    case 'WITHDRAWAL': return 'Sent back to your card or bank';
    default: return entry.direction === 'CREDIT' ? 'Money in' : 'Money out';
  }
}

/**
 * Where a withdrawal has got to (API D-104). Null for every other kind.
 *
 * <p>"Sent" means the provider finished the refund — the bank can take a few more
 * days to show it. NEEDS_REVIEW is money out of the wallet and not yet on the
 * card, and says who has it, because that is the one state a restaurant will
 * phone about.
 */
export function withdrawalProgress(entry: WalletEntry): { label: string; tone: StatusTone } | null {
  if (entry.kind !== 'WITHDRAWAL' || entry.refundStatus == null) return null;
  switch (entry.refundStatus) {
    case 'COMPLETED': return { label: 'Sent', tone: 'success' };
    case 'NEEDS_REVIEW': return { label: `${OPS_TEAM} is checking`, tone: 'warning' };
    case 'FAILED': return { label: 'Retrying', tone: 'pending' };
    default: return { label: 'On its way', tone: 'pending' };
  }
}
