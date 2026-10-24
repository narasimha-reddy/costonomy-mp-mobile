import type { OperatingHours } from '@/services/supplier';

const ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * "Every day", "Mon–Sat" where the days run together, else the days themselves.
 *
 * <p>A count — "6 days a week" — is the one answer that makes a supplier open the
 * screen to find out *which* six.
 */
export function dayLabel(days: string[]): string {
  const indexes = days
    .map((day) => ORDER.indexOf(day))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b);

  if (indexes.length === 0) return 'No days set';
  if (indexes.length === 7) return 'Every day';

  const contiguous = indexes.every((index, i) => i === 0 || index === indexes[i - 1]! + 1);
  if (contiguous && indexes.length > 2) {
    return `${SHORT[indexes[0]!]}–${SHORT[indexes[indexes.length - 1]!]}`;
  }
  return indexes.map((index) => SHORT[index]).join(', ');
}

/** Whether the store has a real opening window (opening time different from closing time). */
export function hoursAreSet(hours: OperatingHours | null | undefined): boolean {
  return !!hours && hours.opensAt !== '' && hours.closesAt !== '' && hours.opensAt !== hours.closesAt;
}

/** The unset pair the server holds for a store that never chose hours. */
export const UNSET_TIME = '00:00';

/** The editor shows empty inputs for hours that are not set, rather than a 00:00 nobody typed. */
export function hoursUnset(hours: OperatingHours): boolean {
  return hours.opensAt === UNSET_TIME && hours.closesAt === UNSET_TIME;
}

/**
 * What the store form saves. Both inputs blank means the user chose no hours, so the server's own unset pair goes
 * back unchanged; only one blank is refused rather than guessed.
 */
export function normaliseHours(hours: OperatingHours): { hours: OperatingHours; problem: string | null } {
  const opens = hours.opensAt.trim();
  const closes = hours.closesAt.trim();
  if (opens === '' && closes === '') return { hours: { ...hours, opensAt: UNSET_TIME, closesAt: UNSET_TIME }, problem: null };
  if (opens === '' || closes === '') return { hours, problem: 'Enter both an opening and a closing time, or leave both empty.' };
  return { hours, problem: null };
}

/**
 * One line for a store's trading hours.
 *
 * <p>An opening time equal to the closing time (00:00–00:00 is what an unset
 * store carries) is not a window: the model has no 24-hour flag, so it is shown
 * as not set rather than guessed to mean either "always open" or "never open".
 */
export function storeHoursLine(hours: OperatingHours | null | undefined): string {
  if (!hours) return 'Hours not set';
  const days = dayLabel(hours.days);
  if (days === 'No days set') return days;
  if (!hoursAreSet(hours)) return 'Hours not set';
  return `${days} · ${hours.opensAt}–${hours.closesAt}`;
}
