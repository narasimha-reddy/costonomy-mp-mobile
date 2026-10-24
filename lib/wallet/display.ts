import type { WalletEntry, WalletLimits } from '@/models/wallet';
import { formatMoney, type Money } from '@/utils/money';

const GROUPED = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * A balance split for the hero: small ₹, large whole rupees, smaller paise.
 * Null when the figure is not a number, so a screen shows a dash rather than ₹NaN.
 */
export function splitBalance(amount: Money | number | null | undefined): {
  negative: boolean;
  rupees: string;
  paise: string;
} | null {
  if (amount == null || amount === '') return null;
  const n = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(n)) return null;
  const [rupees, paise] = GROUPED.format(Math.abs(n)).split('.');
  return { negative: n < 0, rupees: rupees ?? '0', paise: paise ?? '00' };
}

export interface LimitMeter {
  /** 0 to 100, for the bar's width. */
  percent: number;
  added: string;
  limit: string;
}

/**
 * How much of the month's top-up allowance is used, for the thin bar on the hero.
 *
 * <p>Null when the limits are unknown or unreadable, and the screen then shows no
 * meter at all. The bar is clamped: added past the limit (a limit lowered mid-month)
 * is a full bar, not an overflowing one, and a limit of zero is full once anything
 * has been added and empty before.
 */
export function limitMeter(limits: WalletLimits | null | undefined): LimitMeter | null {
  if (limits == null) return null;
  const added = Number(limits.addedThisMonth);
  const limit = Number(limits.monthlyTopUpLimit);
  if (!Number.isFinite(added) || !Number.isFinite(limit)) return null;

  const raw = limit > 0 ? (added / limit) * 100 : (added > 0 ? 100 : 0);
  return {
    percent: Math.min(100, Math.max(0, raw)),
    added: formatMoney(limits.addedThisMonth, true),
    limit: formatMoney(limits.monthlyTopUpLimit, true),
  };
}

export interface EntryDay {
  /** `yyyy-mm-dd` in the device's zone; the key and the sort order. */
  day: string;
  entries: WalletEntry[];
}

/** Local calendar day of an ISO instant, or null if it is not a date. */
function dayOf(iso: string): string | null {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

/**
 * The statement grouped by day, newest day first; entries keep the order they came
 * in (the server's, newest first). An entry with an unreadable time goes in a
 * final group with an empty day rather than being dropped from the statement.
 */
export function groupEntriesByDay(entries: WalletEntry[]): EntryDay[] {
  const groups = new Map<string, WalletEntry[]>();
  for (const entry of entries) {
    const key = dayOf(entry.at) ?? '';
    const list = groups.get(key);
    if (list) list.push(entry); else groups.set(key, [entry]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : b.localeCompare(a)))
    .map(([day, list]) => ({ day, entries: list }));
}
