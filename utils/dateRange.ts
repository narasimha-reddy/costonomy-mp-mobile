/**
 * A window of time, and the presets people actually ask for.
 *
 * <p>Its own module because more than one screen wants "last week": orders,
 * settlements and the credit ledger all answer a question about a period, and
 * three implementations of "last 7 days" will disagree about whether that means
 * 7×24 hours or seven calendar days. It means seven calendar days here, ending
 * tonight, because that is what a person means.
 */
export type DateRangeKey = 'today' | 'week' | 'month' | 'quarter' | 'custom';

export interface DateRange {
  key: DateRangeKey;
  /** Inclusive start, at local midnight. */
  from: Date;
  /** Exclusive end, at the next local midnight, so today's orders are included. */
  to: Date;
}

export const RANGE_LABELS: Record<DateRangeKey, string> = {
  today: 'Today',
  week: 'Last 7 days',
  month: 'Last 30 days',
  quarter: 'Last 90 days',
  custom: 'Custom range',
};

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/**
 * The end of a window that includes {@code date}.
 *
 * <p>Exclusive, at the following midnight. An end of "now" quietly drops an order
 * placed two minutes ago every time the list refreshes, which reads as orders
 * disappearing.
 */
function endOfDay(date: Date): Date {
  const copy = startOfDay(date);
  copy.setDate(copy.getDate() + 1);
  return copy;
}

export function rangeFor(key: Exclude<DateRangeKey, 'custom'>, now = new Date()): DateRange {
  const days = key === 'today' ? 1 : key === 'week' ? 7 : key === 'month' ? 30 : 90;
  const from = startOfDay(now);
  from.setDate(from.getDate() - (days - 1));
  return { key, from, to: endOfDay(now) };
}

export function customRange(from: Date, to: Date): DateRange {
  // Tolerate a backwards pair rather than refusing: someone picking a start after
  // an end has made an ordering mistake, not asked for nothing.
  const [first, second] = from <= to ? [from, to] : [to, from];
  return { key: 'custom', from: startOfDay(first), to: endOfDay(second) };
}

/** The default everywhere, until a screen has a reason to differ. */
export function defaultRange(now = new Date()): DateRange {
  return rangeFor('week', now);
}

/** What the trigger says: the preset's name, or the dates themselves. */
export function describeRange(range: DateRange): string {
  if (range.key !== 'custom') return RANGE_LABELS[range.key];
  const last = new Date(range.to);
  last.setDate(last.getDate() - 1);
  return `${shortDate(range.from)} – ${shortDate(last)}`;
}

function shortDate(date: Date): string {
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** ISO instants for the API, which takes UTC and does not care about local days. */
export function toQuery(range: DateRange): { from: string; to: string } {
  return { from: range.from.toISOString(), to: range.to.toISOString() };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const ORDINALS: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd', 21: 'st', 22: 'nd', 23: 'rd', 31: 'st' };

/**
 * When something happened, as a person says it.
 *
 * <p>`16th Sep 2026 at 11:35 AM (10 mins ago)` — the absolute date because an
 * order is a commercial record that gets quoted in an email, and the relative
 * part because "10 mins ago" is what decides whether you act on it now.
 *
 * <p>Neither alone is enough. A relative time on its own cannot be quoted or
 * cross-checked, and an absolute one makes you subtract to learn the only thing
 * you wanted to know.
 */
export function formatMoment(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return '—';
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return '—';

  const day = when.getDate();
  const month = MONTHS[when.getMonth()];
  const suffix = ORDINALS[day] ?? 'th';

  // Built rather than localised. `toLocaleTimeString` gives "am" in one locale
  // and "AM" in another, and `toLocaleDateString` gives "Sept" where we want
  // "Sep" — so the same order reads differently on two phones, and a test passes
  // or fails depending on the machine running it.
  const hours24 = when.getHours();
  const hour = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const minute = String(when.getMinutes()).padStart(2, '0');
  const meridiem = hours24 < 12 ? 'AM' : 'PM';
  const time = `${hour}:${minute} ${meridiem}`;

  return `${day}${suffix} ${month} ${when.getFullYear()} at ${time} (${relative(when, now)})`;
}

/** Just the "(10 mins ago)" part, for places with no room for the rest. */
export function relative(when: Date, now = new Date()): string {
  const seconds = Math.round((now.getTime() - when.getTime()) / 1000);

  // A clock a few seconds ahead of ours should not produce "in 3 seconds".
  if (seconds < 45) return 'just now';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;

  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;

  const years = Math.round(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}
