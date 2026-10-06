/** India's offset from UTC. There is no daylight saving to get wrong. */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** Three-or-four-letter months as written on the History rows ("30 Sept"). */
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? '' : 's'} ago`;
}

/**
 * When a History row happened, as a person says it: "Just now", "12 minutes ago",
 * "4 hours ago", "3 days ago", then the date — "30 Sept" in the same calendar year,
 * "30 Sept 2025" in another. A week or more ago is the date.
 *
 * <p>The date is the India date, like the month bars (the server cuts months at IST
 * midnight). An instant in the future (a phone clock behind the server's) reads "Just now",
 * and a value that is not a date reads as an empty string.
 */
export function historyTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const when = Date.parse(iso);
  if (Number.isNaN(when)) return '';
  const elapsed = now.getTime() - when;

  if (elapsed < MINUTE_MS) return 'Just now';
  if (elapsed < HOUR_MS) return plural(Math.floor(elapsed / MINUTE_MS), 'minute');
  if (elapsed < DAY_MS) return plural(Math.floor(elapsed / HOUR_MS), 'hour');
  if (elapsed < 7 * DAY_MS) return plural(Math.floor(elapsed / DAY_MS), 'day');

  const ist = new Date(when + IST_OFFSET_MS);
  const nowYear = new Date(now.getTime() + IST_OFFSET_MS).getUTCFullYear();
  const day = `${ist.getUTCDate()} ${SHORT_MONTHS[ist.getUTCMonth()]}`;
  return ist.getUTCFullYear() === nowYear ? day : `${day} ${ist.getUTCFullYear()}`;
}
