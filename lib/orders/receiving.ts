import type { SupplierOrderItem } from '@/models/procurement';
import type { Receiving } from '@/models/trust';
import { formatMoney, formatQuantity } from '@/utils/money';

/**
 * The restaurant's check-in at the door (API D-128, D-129): what must be accounted for, and what the server says
 * came of a rejection. Nothing here prices anything: the refund amount, where it went and the credit note number are
 * the server's, shown as sent, and an absent one is absent rather than invented.
 */

/**
 * What the three counts (received, damaged, missing) must add up to: the billed quantity on a weighed catch-weight
 * line, otherwise what the supplier accepted. Checking a weighed line against the accepted quantity would have the
 * buyer enter the shortfall as "missing" and be refunded for it a second time.
 */
export function billedQuantityOf(item: SupplierOrderItem): number {
  return Number(item.billableQuantity ?? item.acceptedQuantity ?? item.requestedQuantity);
}

/** Quantities are compared in thousandths (the API allows three decimals), so 0.1 + 0.2 is 0.3. */
export function thousandths(quantity: number): number {
  return Math.round(quantity * 1000);
}

/** A count as the API takes it: at most three decimals, so stepper arithmetic (8.600000000000001) is never sent. */
export function quantityString(quantity: number): string {
  return String(thousandths(quantity) / 1000);
}

/** Whether the three counts add up to the quantity that must be accounted for. */
export function accountsFor(received: number, damaged: number, missing: number, billed: number): boolean {
  return thousandths(received) + thousandths(damaged) + thousandths(missing) === thousandths(billed);
}

export interface Counts { received: number; damaged: number; missing: number }

/**
 * Received after a Damaged or Missing quantity was entered: what is left of the billed quantity, so the three add up
 * without the buyer lowering Received by hand. A UI convenience only (the server still validates). A weighed
 * catch-weight line is left alone: its received weight is what was read, not a remainder.
 */
export function rebalanceReceived(item: SupplierOrderItem, billed: number, counts: Counts): number {
  if (item.isCatchWeight) return counts.received;
  const left = thousandths(billed) - thousandths(counts.damaged) - thousandths(counts.missing);
  return Math.max(0, left) / 1000;
}

/** What to do when the counts do not add up, with the number from the billed quantity. */
export function unaccountedHint(counts: Counts, billed: number, unit: string): string {
  const target = thousandths(billed) - thousandths(counts.damaged) - thousandths(counts.missing);
  if (target < 0) return `Damaged and Missing add up to more than ${formatQuantity(String(billed))} ${unit}`;
  const verb = thousandths(counts.received) > target ? 'Lower' : 'Raise';
  return `${verb} Received to ${formatQuantity(String(target / 1000))} ${unit}`;
}

/** The line's caption when it was weighed: the quantity the counts must add up to, and why it is not the ordered one. */
export function weighedCaption(item: SupplierOrderItem): string | null {
  return item.isCatchWeight && item.billableQuantity != null
    ? `Weighed and billed ${formatQuantity(item.billableQuantity, item.unit)}`
    : null;
}

export interface RefundOutcome {
  /** The server's refund amount, formatted. */
  amount: string;
  /** Where it went, or what it is waiting for, or null when the server did not say enough to claim anything. */
  where: string | null;
  /** Whether the refund lands in the wallet (card or wallet payment), so the wallet is worth opening. */
  toWallet: boolean;
  /** The credit note, only when the server has issued one. */
  creditNoteNumber: string | null;
  /** Each refunded line and its amount, from the server. */
  lines: { name: string; amount: string }[];
}

/**
 * What to tell the restaurant after a check-in with a rejection, or null when nothing was refunded.
 *
 * <p>Where the money goes is how the order was paid (the API returns it through the same method): card money comes
 * back as a withdrawable wallet refund, wallet money to the wallet, and a credit order's invoice comes down. A card
 * payment still being captured cannot be refunded yet; the server holds the refund and applies it when the capture
 * lands, which needs nothing from the restaurant. The credit note is issued after the check-in commits, and not at all
 * while tax invoices are switched off, so a missing number is normal and nothing here promises one.
 */
export function refundOutcome(receiving: Receiving, paymentMethod: string | null | undefined): RefundOutcome | null {
  const refund = receiving.instantRefundAmount;
  if (refund == null || !(Number(refund) > 0)) return null;
  const amount = formatMoney(String(refund));

  let where: string | null;
  if (receiving.refundStatus === 'PENDING_CAPTURE') {
    where = `${amount} comes back once your card payment finishes. There is nothing for you to do.`;
  } else if (receiving.refundStatus === 'APPLIED') {
    where = destination(paymentMethod);
  } else {
    // An API that did not say: claim nothing about where it went.
    where = null;
  }

  return {
    amount,
    where,
    toWallet: paymentMethod === 'PREPAID' || paymentMethod === 'WALLET',
    creditNoteNumber: receiving.creditNoteNumber ?? null,
    lines: (receiving.items ?? [])
      .filter((line) => Number(line.refundAmount ?? 0) > 0)
      .map((line) => ({ name: line.productName, amount: formatMoney(String(line.refundAmount)) })),
  };
}

function destination(paymentMethod: string | null | undefined): string | null {
  switch (paymentMethod) {
    case 'PREPAID': return 'Back in your wallet as a refund you can withdraw.';
    case 'WALLET': return 'Back in your wallet.';
    case 'CREDIT': return 'Taken off what you owe this supplier.';
    default: return null;
  }
}
