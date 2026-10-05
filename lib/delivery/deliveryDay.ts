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

/** What the buyer can ask for: as soon as possible, or a day within the next two. */
export const DELIVERY_DAY_CHOICES: { offset: number | null; label: string }[] = [
  { offset: null, label: 'Immediate' },
  { offset: 0, label: 'Today' },
  { offset: 1, label: 'Tomorrow' },
  { offset: 2, label: 'In 2 days' },
];

/** The date to send for a choice: nothing for immediate. */
export function preferredDateFor(offset: number | null, now: number = Date.now()): string | undefined {
  return offset == null ? undefined : istDay(offset, now);
}

/** A `YYYY-MM-DD` day for people: "Immediate" when there is none. */
export function describeDeliveryDay(day: string | null | undefined): string {
  if (day == null) return 'Immediate';
  const [year, month, date] = day.split('-').map(Number);
  if (year == null || month == null || date == null) return day;
  return new Date(year, month - 1, date).toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}
