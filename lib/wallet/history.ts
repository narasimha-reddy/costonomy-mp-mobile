import type {
  WalletCategory,
  WalletEntry,
  WalletEntryKind,
  WalletFilters,
  WalletInstrument,
  WalletMonthTotal,
  WalletStatusFilter,
} from '@/models/wallet';
import type { StatusTone } from '@/components/common/MandiStatusChip';
import { entryLabel, withdrawalProgress } from '@/lib/wallet/entryCopy';
import { formatMoney } from '@/utils/money';
import { relative } from '@/utils/dateRange';

/** India's offset from UTC. There is no daylight saving to get wrong. */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The month an instant belongs to, as `yyyy-MM` in India time — or null if it is
 * not a date.
 *
 * <p>In India time and not the phone's: the server's month totals and month filter
 * are cut at IST midnight, so a row must sit under the month whose total counts it.
 * 30 September 7 pm UTC is already 1 October here.
 */
export function istMonthKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const ist = new Date(ms + IST_OFFSET_MS);
  return `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}`;
}

/** "September 2026" from `2026-09`; the empty key is entries with no readable time. */
export function monthTitle(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  const name = match ? MONTH_NAMES[Number(match[2]) - 1] : undefined;
  return match && name ? `${name} ${match[1]}` : 'Earlier';
}

export interface EntryMonth {
  /** `yyyy-MM`, or '' for entries whose time cannot be read. */
  month: string;
  entries: WalletEntry[];
}

/**
 * The list cut into months, in the order the entries came (the server's, newest
 * first). An unreadable time goes in a final '' group rather than being dropped.
 */
export function groupEntriesByMonth(entries: WalletEntry[]): EntryMonth[] {
  const groups = new Map<string, WalletEntry[]>();
  for (const entry of entries) {
    const key = istMonthKey(entry.at) ?? '';
    const list = groups.get(key);
    if (list) list.push(entry); else groups.set(key, [entry]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : b.localeCompare(a)))
    .map(([month, list]) => ({ month, entries: list }));
}

/** "1 day ago", "10 mins ago" — the age alone; the month bar already says which month. */
export function relativeTime(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return '';
  const when = new Date(iso);
  return Number.isNaN(when.getTime()) ? '' : relative(when, now);
}

/**
 * What a month bar says on the right: what the wallet paid out that month, exactly as
 * the server totalled it, or null when there is no total to show.
 *
 * <p>Never summed here (see `utils/money`). If the API has no totals, or the list is
 * narrowed by something the server did not apply (`narrowed`, the instrument), any
 * figure would be for a different set of rows than the ones below it, so there is none.
 */
export function monthSpentLabel(
  month: string,
  totals: WalletMonthTotal[],
  narrowed = false,
): string | null {
  if (narrowed) return null;
  const total = totals.find((t) => t.month === month);
  if (total == null || total.spent == null || total.spent === '') return null;
  const shown = formatMoney(total.spent, true);
  return shown === '—' ? null : shown;
}

/** A row's identity: the server's `key`, else its id. */
export function entryKey(entry: { id: number; key?: string }): string {
  return entry.key ?? String(entry.id);
}

/**
 * Add a page to those already loaded, keeping the first copy of any row.
 *
 * <p>Pages are cut by a cursor while movements keep arriving, so consecutive pages
 * can overlap; the same row listed twice would be the same payment shown twice.
 */
export function mergePages<T extends { id: number; key?: string }>(pages: { items: T[] }[]): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const page of pages) {
    for (const item of page.items) {
      const key = entryKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }
  return merged;
}

/** Month totals across pages; a later page's figure for a month replaces an earlier one. */
export function mergeMonthTotals(pages: { monthTotals: WalletMonthTotal[] }[]): WalletMonthTotal[] {
  const byMonth = new Map<string, WalletMonthTotal>();
  for (const page of pages) {
    for (const total of page.monthTotals) byMonth.set(total.month, total);
  }
  return [...byMonth.values()];
}

// ── What a row says ───────────────────────────────────────────────────

/** The small label above a row's title. */
export function categoryLabel(kind: WalletEntryKind | string): string {
  switch (kind) {
    case 'TOP_UP': return 'Top-up';
    case 'ORDER_PAYMENT': return 'Order payment';
    case 'ORDER_REFUND':
    case 'REFUND':
    case 'DISPUTE_REFUND': return 'Refund';
    case 'WITHDRAWAL':
    case 'WITHDRAWAL_REVERSAL': return 'Withdrawal';
    case 'QUICKSCAN_PAYMENT':
    case 'QUICKSCAN_RETURN': return 'Shop payment';
    default: return 'Wallet';
  }
}

export interface EntryPresentation {
  category: string;
  title: string;
  /** Right-hand amount, sign included; unsigned when the money is not moving now. */
  sign: '+' | '−' | '';
  tone: 'credit' | 'debit' | 'neutral';
  /** "Debited from Card •1007", or null. */
  instrumentLine: string | null;
  chip: { label: string; tone: StatusTone } | null;
}

/**
 * How a row reads, from what the server said about it.
 *
 * <p>A returned movement is money that went out and came back: showing "−₹500" would
 * say the wallet lost it, "+₹500" that it gained it, so it is shown without a sign or
 * colour and the chip says where it went. A failed or in-progress one is likewise not
 * a settled movement, but keeps its sign — the amount is what is being attempted.
 * Missing `status` is a completed row, the only kind an older API sent.
 */
export function presentEntry(entry: WalletEntry): EntryPresentation {
  const status = entry.status ?? 'COMPLETED';
  const credit = entry.direction === 'CREDIT';

  // The server saying the money came back to the bank/card wins. Otherwise a
  // withdrawal's own refund status (Sent, Checking, Couldn't be sent · back in your
  // wallet, ...) is more exact than the general status, so it is shown first.
  let chip: EntryPresentation['chip'] = null;
  if (status === 'RETURNED') chip = { label: 'Returned to your bank/card', tone: 'neutral' };
  else {
    chip = withdrawalProgress(entry);
    if (chip == null) {
      if (status === 'IN_PROGRESS') chip = { label: 'On its way', tone: 'pending' };
      else if (status === 'FAILED') chip = { label: 'Failed', tone: 'danger' };
    }
  }

  const returned = status === 'RETURNED';
  const failed = status === 'FAILED';

  return {
    category: categoryLabel(entry.kind),
    title: entryLabel(entry),
    sign: returned ? '' : credit ? '+' : '−',
    tone: returned || failed ? 'neutral' : credit ? 'credit' : 'debit',
    instrumentLine: instrumentLine(entry),
    chip,
  };
}

function instrumentLine(entry: WalletEntry): string | null {
  const instrument = entry.instrument?.trim();
  if (!instrument) return null;
  return entry.kind === 'WITHDRAWAL' ? `Sent to ${instrument}` : `Debited from ${instrument}`;
}

// ── Filters ───────────────────────────────────────────────────────────

export const NO_FILTERS: WalletFilters = { months: [], categories: [], instruments: [], statuses: [] };

export type FilterSection = keyof WalletFilters;

export type FilterAction =
  | { type: 'toggle'; section: FilterSection; value: string }
  | { type: 'clear' };

/** Tick or untick one choice; "Clear all" empties every section. */
export function filterReducer(state: WalletFilters, action: FilterAction): WalletFilters {
  if (action.type === 'clear') return NO_FILTERS;
  const current = state[action.section] as string[];
  const next = current.includes(action.value)
    ? current.filter((v) => v !== action.value)
    : [...current, action.value];
  return { ...state, [action.section]: next };
}

export function filterCount(filters: WalletFilters): number {
  return filters.months.length + filters.categories.length
    + filters.instruments.length + filters.statuses.length;
}

/**
 * Whether "Apply" is live: something is chosen, or what was applied before is being
 * cleared (there would otherwise be no way to take the filters off from this screen).
 */
export function canApply(state: WalletFilters, applied: WalletFilters = NO_FILTERS): boolean {
  return filterCount(state) > 0 || filterCount(applied) > 0;
}

export const CATEGORY_OPTIONS: { key: WalletCategory; label: string; kinds: WalletEntryKind[] }[] = [
  { key: 'TOP_UP', label: 'Top-up', kinds: ['TOP_UP'] },
  { key: 'ORDER_PAYMENT', label: 'Order payment', kinds: ['ORDER_PAYMENT'] },
  { key: 'REFUND', label: 'Refund', kinds: ['ORDER_REFUND', 'REFUND', 'DISPUTE_REFUND'] },
  { key: 'WITHDRAWAL', label: 'Withdrawal', kinds: ['WITHDRAWAL', 'WITHDRAWAL_REVERSAL'] },
  { key: 'SHOP_PAYMENT', label: 'Shop payment (QuickScan)', kinds: ['QUICKSCAN_PAYMENT', 'QUICKSCAN_RETURN'] },
];

export const INSTRUMENT_OPTIONS: { key: WalletInstrument; label: string; prefixes: string[] }[] = [
  { key: 'CARD', label: 'Card', prefixes: ['card'] },
  { key: 'UPI', label: 'UPI', prefixes: ['upi'] },
  { key: 'NETBANKING', label: 'Netbanking', prefixes: ['netbanking', 'net banking'] },
  { key: 'WALLET', label: 'Wallet', prefixes: ['wallet'] },
];

export const STATUS_OPTIONS: { key: WalletStatusFilter; label: string }[] = [
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'IN_PROGRESS', label: 'In progress' },
  { key: 'RETURNED', label: 'Returned' },
];

/**
 * Whether an entry was paid with one of the chosen instruments. The server does not
 * filter by instrument, so this runs on what has been loaded; nothing chosen matches all.
 */
export function matchesInstruments(entry: WalletEntry, chosen: WalletInstrument[]): boolean {
  if (chosen.length === 0) return true;
  const instrument = entry.instrument?.trim().toLowerCase();
  if (!instrument) return false;
  return INSTRUMENT_OPTIONS
    .filter((option) => chosen.includes(option.key))
    .some((option) => option.prefixes.some((prefix) => instrument.startsWith(prefix)));
}

/** Whether any loaded entry says what it was paid with — else there is nothing to filter by. */
export function hasInstruments(entries: WalletEntry[]): boolean {
  return entries.some((entry) => (entry.instrument?.trim() ?? '') !== '');
}

/** `?months=…&kinds=…&statuses=…&cursor=…&size=…`, empty parts left out and values escaped. */
export function buildTransactionsQuery(params: {
  filters?: WalletFilters;
  cursor?: string | null;
  size?: number;
}): string {
  const filters = params.filters ?? NO_FILTERS;
  const kinds = CATEGORY_OPTIONS
    .filter((option) => filters.categories.includes(option.key))
    .flatMap((option) => option.kinds);

  const parts: string[] = [];
  const list = (name: string, values: string[]) => {
    if (values.length > 0) parts.push(`${name}=${values.map(encodeURIComponent).join(',')}`);
  };
  list('months', [...filters.months].sort().reverse());
  list('kinds', kinds);
  list('statuses', filters.statuses);
  if (params.cursor) parts.push(`cursor=${encodeURIComponent(params.cursor)}`);
  if (params.size != null) parts.push(`size=${params.size}`);
  return parts.length === 0 ? '' : `?${parts.join('&')}`;
}

// ── Filters in the route ──────────────────────────────────────────────

/** The filters as route params, so Filters and History need no shared store. */
export function filtersToParams(filters: WalletFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.months.length > 0) params.months = filters.months.join(',');
  if (filters.categories.length > 0) params.categories = filters.categories.join(',');
  if (filters.instruments.length > 0) params.instruments = filters.instruments.join(',');
  if (filters.statuses.length > 0) params.statuses = filters.statuses.join(',');
  return params;
}

function pick<T extends string>(raw: string | string[] | undefined, allowed: readonly T[]): T[] {
  const text = Array.isArray(raw) ? raw[0] : raw;
  if (!text) return [];
  return text.split(',').filter((v): v is T => (allowed as readonly string[]).includes(v));
}

/** Route params back into filters; anything unrecognised is dropped rather than sent on. */
export function filtersFromParams(
  params: Record<string, string | string[] | undefined>,
): WalletFilters {
  const rawMonths = Array.isArray(params.months) ? params.months[0] : params.months;
  return {
    months: (rawMonths ?? '').split(',').filter((m) => /^\d{4}-\d{2}$/.test(m)),
    categories: pick(params.categories, CATEGORY_OPTIONS.map((o) => o.key)),
    instruments: pick(params.instruments, INSTRUMENT_OPTIONS.map((o) => o.key)),
    statuses: pick(params.statuses, STATUS_OPTIONS.map((o) => o.key)),
  };
}

export interface MonthChoice {
  month: string;
  label: string;
  /** No movement that month, so ticking it could only give an empty list. */
  disabled: boolean;
}

/**
 * The Months list: the last `count` months, newest first, plus any older month that has
 * movement. Months without any are greyed out — except one already ticked, which stays
 * live so it can be unticked.
 */
export function monthChoices(
  available: string[],
  selected: string[],
  now = new Date(),
  count = 12,
): MonthChoice[] {
  const current = istMonthKey(now.toISOString()) ?? '';
  const [year = 0, month = 1] = current.split('-').map(Number);
  const recent = Array.from({ length: count }, (_, i) => {
    const index = year * 12 + (month - 1) - i;
    return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
  });
  const all = [...new Set([...recent, ...available, ...selected])].sort().reverse();
  return all.map((m) => ({
    month: m,
    label: monthTitle(m),
    disabled: !available.includes(m) && !selected.includes(m),
  }));
}
