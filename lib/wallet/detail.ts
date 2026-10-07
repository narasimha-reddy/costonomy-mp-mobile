import { rowLabel, rowTitle } from '@/lib/wallet/entryCopy';
import { formatRupees } from '@/lib/wallet/history';
import type { WalletEntryStatus, WalletReference, WalletTransactionDetail } from '@/models/wallet';
import { DetailStatusColors } from '@/theme';

/** The header of the Transaction details screen: its colour (also the status bar) and its words. */
export interface DetailHeader {
  color: string;
  title: string;
}

/** Header colour and title for an entry's status. An absent or unknown status reads as completed. */
export function detailHeader(status: WalletEntryStatus | string | null | undefined): DetailHeader {
  switch (status) {
    case 'IN_PROGRESS': return { color: DetailStatusColors.inProgress, title: 'Transaction in progress' };
    case 'FAILED': return { color: DetailStatusColors.failed, title: 'Transaction failed' };
    case 'RETURNED': return { color: DetailStatusColors.returned, title: 'Money returned' };
    default: return { color: DetailStatusColors.success, title: 'Transaction Successful' };
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const two = (n: number) => String(n).padStart(2, '0');

/** "07:54 am on 02 Oct 2026", in the phone's own time zone. Empty for a date that cannot be read. */
export function detailTime(at: string | Date | null | undefined): string {
  if (at == null) return '';
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  const h = d.getHours();
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${two(hour12)}:${two(d.getMinutes())} ${h < 12 ? 'am' : 'pm'} on ${two(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** The small bold line over the card's first row: "Paid to", "Received from", "Added to wallet"... */
export function detailLabel(entry: Pick<WalletTransactionDetail, 'kind' | 'direction'>): string {
  return rowLabel(entry as WalletTransactionDetail);
}

/** Money in is the filled orange tile with a down-left arrow; money out the tinted tile with an up-right one. */
export function detailAvatar(direction: string): 'in' | 'out' {
  return direction === 'CREDIT' ? 'in' : 'out';
}

/** The counterparty's name, or, when the server has none, the same title the History row shows. */
export function detailName(entry: WalletTransactionDetail): string {
  return entry.counterpartyName?.trim() || rowTitle(entry);
}

/** "Credited to" for money in, "Debited from" for money out: the wallet is always the other side. */
export function walletSideLabel(direction: string): string {
  return direction === 'CREDIT' ? 'Credited to' : 'Debited from';
}

export interface ReferenceLine {
  key: string;
  text: string;
  value: string;
  copyable: boolean;
}

/** The `references` as lines under the wallet row: "Reference: QuickScan payment 41". Blank values are dropped. */
export function referenceLines(references: WalletReference[] | null | undefined): ReferenceLine[] {
  return (references ?? [])
    .filter((r) => r != null && String(r.value ?? '').trim() !== '')
    // A credit repayment shows its invoices and credit line in their own block.
    .filter((r) => r.label !== CREDIT_INVOICE_LABEL && r.label !== CREDIT_LINE_LABEL)
    .map((r, i) => ({
      key: `${i}-${r.label}`,
      text: `Reference: ${r.label ? `${r.label} ` : ''}${r.value}`,
      value: String(r.value),
      copyable: r.copyable === true,
    }));
}

/** The reference labels the API gives a CREDIT_REPAYMENT (WalletEntryDetailService). */
const CREDIT_INVOICE_LABEL = 'Credit invoice';
const CREDIT_LINE_LABEL = 'Credit line';

export interface CreditRepaymentInfo {
  /** Invoice numbers the repayment settled, oldest first. */
  invoices: string[];
  /** The credit line's agreement id, or null when the server did not say. */
  agreementId: string | null;
}

/** What a CREDIT_REPAYMENT's references say; null for every other kind. */
export function creditRepaymentInfo(entry: Pick<WalletTransactionDetail, 'kind' | 'references'>): CreditRepaymentInfo | null {
  if (entry.kind !== 'CREDIT_REPAYMENT') return null;
  const refs = (entry.references ?? []).filter((r) => r != null && String(r.value ?? '').trim() !== '');
  const line = refs.find((r) => r.label === CREDIT_LINE_LABEL);
  return {
    invoices: refs.filter((r) => r.label === CREDIT_INVOICE_LABEL).map((r) => String(r.value)),
    agreementId: line != null && /^\d+$/.test(String(line.value).trim()) ? String(line.value).trim() : null,
  };
}

/** The credit line screen for an agreement id. */
export const creditLineRoute = (agreementId: string) => `/restaurant/credit/${agreementId}`;

/** "costonomy-receipt-184.png"; anything in the id that is not safe in a file name becomes "-". */
export function receiptFileName(transactionId: string | number): string {
  const safe = String(transactionId).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'receipt';
  return `costonomy-receipt-${safe}.png`;
}

/** The amount as it is read aloud: "85 rupees". */
export function spokenAmount(amount: string | number): string {
  return `${formatRupees(amount).replace('₹', '')} rupees`;
}
