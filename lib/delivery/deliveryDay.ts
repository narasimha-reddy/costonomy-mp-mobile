/**
 * The delivery day a buyer asks for when sending a request (API D-140).
 *
 * <p>Days are India's calendar days, because that is what the server checks and
 * what a kitchen means by "today". `toISOString` is UTC, which between midnight
 * and half past five in the morning is still yesterday in India, so a request
 * sent then for "today" would be refused as a day in the past.
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` for India's date, `offsetDays` from today. */
export function istDay(offsetDays = 0, now: number = Date.now()): string {
  return new Date(now + IST_OFFSET_MS + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

/** How far ahead a request can be for: what the server accepts (API D-140). A wedding is planned weeks out. */
export const MAX_DAYS_AHEAD = 30;

/** "Today", "Tomorrow", then "Wed 7 Oct". */
export function dayLabel(offset: number, now: number = Date.now()): string {
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  const [year, month, date] = istDay(offset, now).split('-').map(Number);
  return new Date(Date.UTC(year as number, (month as number) - 1, date as number)).toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  });
}

/** Every day the buyer can pick, today first. */
export function dayChoices(now: number = Date.now()): { offset: number; label: string }[] {
  return Array.from({ length: MAX_DAYS_AHEAD + 1 }, (_, offset) => ({ offset, label: dayLabel(offset, now) }));
}

/** "Deliver by" times a kitchen asks for, in India's hours. */
export const DELIVER_BY_HOURS = [6, 8, 12, 16];

/** The "deliver by" hours still ahead: for today, only those after the current hour in India. */
export function deliverByHoursFor(offset: number, now: number = Date.now()): number[] {
  if (offset !== 0) return DELIVER_BY_HOURS;
  const hourNow = new Date(now + IST_OFFSET_MS).getUTCHours();
  return DELIVER_BY_HOURS.filter((hour) => hour > hourNow);
}

export function deliverByLabel(hour: number): string {
  return hour === 12 ? 'By noon' : hour < 12 ? `By ${hour} am` : `By ${hour - 12} pm`;
}

/** The moment `hour`:00 in India on `day` (`YYYY-MM-DD`), as an ISO instant in UTC. */
export function istInstant(day: string, hour: number): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year as number, (month as number) - 1, date as number, hour) - IST_OFFSET_MS)
    .toISOString();
}

/** The date to send for a choice: nothing for immediate. */
export function preferredDateFor(offset: number | null, now: number = Date.now()): string | undefined {
  return offset == null ? undefined : istDay(offset, now);
}

/** A `YYYY-MM-DD` day for people: "As soon as possible" when there is none. */
export function describeDeliveryDay(day: string | null | undefined): string {
  if (day == null) return 'As soon as possible';
  const [year, month, date] = day.split('-').map(Number);
  if (year == null || month == null || date == null) return day;
  return new Date(year, month - 1, date).toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}
