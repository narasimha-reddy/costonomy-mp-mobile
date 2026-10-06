import type { WalletEntry } from '@/models/wallet';
import { accountLine, rowLabel, rowTitle } from '@/lib/wallet/entryCopy';

/** Lower-case, one space between words. */
function normalise(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Only the digits and the decimal point: what "₹1,250.50" and "1250.5" have in common. */
function numeric(text: string): string {
  return text.replace(/[^0-9.]/g, '').replace(/^0+(?=\d)/, '');
}

/** The amount as typed on the screen ("49,000", "115.5") and plain ("49000"), for matching. */
function amountForms(amount: string): string[] {
  const n = Number(amount);
  if (!Number.isFinite(n)) return [];
  const plain = String(n);
  const grouped = n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  return [plain, grouped.replace(/,/g, '')];
}

/** Whether an entry matches a search: its title, label, reason, instrument or amount contains it. */
export function entryMatches(entry: WalletEntry, query: string): boolean {
  const q = normalise(query);
  if (q === '') return true;

  const text = [rowTitle(entry), rowLabel(entry), accountLine(entry), entry.reason ?? '', entry.instrument ?? '']
    .map(normalise);
  if (text.some((t) => t.includes(q))) return true;

  // A number typed with a rupee sign, commas or not, matches the amount it appears in.
  const digits = numeric(q);
  if (digits !== '' && /^[\d\s,.₹rs]+$/i.test(q)) {
    return amountForms(entry.amount).some((form) => form.includes(digits));
  }
  return false;
}

/** The entries that match; an empty query keeps them all, in their order. */
export function searchEntries(entries: WalletEntry[], query: string): WalletEntry[] {
  return normalise(query) === '' ? entries : entries.filter((entry) => entryMatches(entry, query));
}
