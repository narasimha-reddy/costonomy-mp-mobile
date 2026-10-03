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
    case 'QUICKSCAN_PAYMENT': return 'Paid a shop (QuickScan)';
    case 'QUICKSCAN_RETURN': return 'QuickScan payment returned';
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

// ── The History row (REST-WALLET-02) ──────────────────────────────────

/**
 * The small line above a History row's title, in the order of "what happened, to whom":
 * "Paid to", "Added to wallet", "Refund from", "Withdrawal to", "Received from".
 */
export function rowLabel(entry: WalletEntry): string {
  switch (entry.kind) {
    case 'TOP_UP': return 'Added to wallet';
    case 'ORDER_PAYMENT':
    case 'QUICKSCAN_PAYMENT': return 'Paid to';
    case 'ORDER_REFUND':
    case 'REFUND':
    case 'DISPUTE_REFUND': return 'Refund from';
    case 'WITHDRAWAL': return 'Withdrawal to';
    case 'WITHDRAWAL_REVERSAL':
    case 'QUICKSCAN_RETURN': return 'Received from';
    default:
      if (entry.direction === 'CREDIT') return 'Received from';
      if (entry.direction === 'DEBIT') return 'Paid to';
      return 'Wallet';
  }
}

/**
 * An instrument as the History rows write it: "Card •1007" or "Card ****1007" become
 * "Card •••• 1007"; anything else ("UPI", "Netbanking") is left as it came. Null for none.
 */
export function instrumentName(instrument: string | null | undefined): string | null {
  const text = instrument?.trim();
  if (!text) return null;
  const card = /^card\s*[•*xX.\s-]*(\d{4})$/i.exec(text);
  return card ? `Card •••• ${card[1]}` : text;
}

/** "Order MP-260919-000013" when the reason carries the order number, else "Order #12", else null. */
function orderRef(entry: WalletEntry): string | null {
  const number = /\bMP-[A-Za-z0-9-]+/.exec(entry.reason ?? '');
  if (number) return `Order ${number[0]}`;
  return entry.supplierOrderId != null ? `Order #${entry.supplierOrderId}` : null;
}

/**
 * The bold line of a History row. The list has no counterparty name, so it is the best
 * thing the entry does say: the order, the card it was paid from or sent to, the
 * server's reason text, and last a plain name for the kind.
 */
export function rowTitle(entry: WalletEntry): string {
  const reason = entry.reason?.trim() || null;
  switch (entry.kind) {
    case 'TOP_UP': return instrumentName(entry.instrument) ?? 'Wallet top-up';
    case 'ORDER_PAYMENT': return orderRef(entry) ?? reason ?? 'Order payment';
    case 'ORDER_REFUND': return orderRef(entry) ?? reason ?? 'Cancelled order';
    case 'REFUND': return orderRef(entry) ?? reason ?? 'Refund';
    case 'DISPUTE_REFUND': return orderRef(entry) ?? reason ?? 'Dispute refund';
    case 'WITHDRAWAL': return instrumentName(entry.instrument) ?? 'Card or bank';
    case 'WITHDRAWAL_REVERSAL': return 'Returned withdrawal';
    case 'QUICKSCAN_PAYMENT':
    case 'QUICKSCAN_RETURN': return reason ?? 'QuickScan payment';
    default: return reason ?? entryLabel(entry);
  }
}

/** "Debited from wallet" or "Credited to wallet": the wallet is always the other side of a row. */
export function accountLine(entry: WalletEntry): string {
  return entry.direction === 'CREDIT' ? 'Credited to wallet' : 'Debited from wallet';
}
