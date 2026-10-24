const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

function ordinal(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) return `${day}th`;
  switch (day % 10) {
    case 1: return `${day}st`;
    case 2: return `${day}nd`;
    case 3: return `${day}rd`;
    default: return `${day}th`;
  }
}

/**
 * An India date ('YYYY-MM-DD') in words: "12th Oct". Read from the text, never through a
 * `Date`, so no timezone can move it a day. Null when it is not a date.
 */
export function dayMonth(date: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? '');
  if (m == null) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${ordinal(day)} ${MONTHS[month - 1]}`;
}

function istParts(instant: string | null | undefined): Date | null {
  if (instant == null || instant === '') return null;
  const ms = Date.parse(instant);
  return Number.isNaN(ms) ? null : new Date(ms + IST_OFFSET_MS);
}

/** The India calendar day of an instant: "7th Oct". */
export function istDayMonth(instant: string | null | undefined): string | null {
  const t = istParts(instant);
  return t == null ? null : `${ordinal(t.getUTCDate())} ${MONTHS[t.getUTCMonth()]}`;
}

/** The India clock time of an instant: "9 am", "3:30 pm". */
export function istTime(instant: string | null | undefined): string | null {
  const t = istParts(instant);
  if (t == null) return null;
  const h = t.getUTCHours();
  const min = t.getUTCMinutes();
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}${min === 0 ? '' : `:${String(min).padStart(2, '0')}`} ${h < 12 ? 'am' : 'pm'}`;
}

/** "7th Oct, 3:30 pm" in India time. */
export function istDayTime(instant: string | null | undefined): string | null {
  const day = istDayMonth(instant);
  const time = istTime(instant);
  return day == null || time == null ? null : `${day}, ${time}`;
}
