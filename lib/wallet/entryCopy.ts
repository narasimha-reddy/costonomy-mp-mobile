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
    case 'DISPUTE_REFUND': return 'Refund from a dispute';
    case 'WITHDRAWAL': return 'Sent back to your card or bank';
    case 'WITHDRAWAL_REVERSAL': return 'Withdrawal returned to your wallet';
    // A kind this app does not know (a newer API): say only what the direction shows.
    default:
      if (entry.direction === 'CREDIT') return 'Money in';
      if (entry.direction === 'DEBIT') return 'Money out';
      return 'Wallet activity';
  }
}

/**
 * Where a withdrawal has got to (API D-104). Null for every other kind.
 *
 * <p>REVERSED is the one ending where the money did not leave: the server credited
 * the wallet back (a WITHDRAWAL_REVERSAL entry). REJECTED is the short state before
 * that, or the one that waits for a person.
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
    // The provider refused it and the server has not yet put the money back.
    case 'REJECTED': return { label: 'Checking', tone: 'warning' };
    // The server put the money back in the wallet. Not a success: it never reached the card.
    case 'REVERSED': return { label: "Couldn't be sent · back in your wallet", tone: 'neutral' };
    case 'REQUESTED':
    case 'PROCESSING': return { label: 'On its way', tone: 'pending' };
    // A status this app does not know: never claim it is on its way or done.
    default: return { label: 'Status unavailable', tone: 'neutral' };
  }
}
