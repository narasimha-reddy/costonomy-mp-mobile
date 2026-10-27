/**
 * Trading hours, in the two shapes the app meets them.
 *
 * <p>The store screen edits one window for a set of days: `{ days: ['MONDAY', …], opensAt: '09:00', closesAt: '21:00' }`.
 * costonomy-common-api keeps the outlet's `operatingHours` as windows per day: `{ "mon": [["09:00", "21:00"]], … }`,
 * where a day that is absent (or has no window) is closed. These convert between them the same way the Marketplace API
 * does (`OperatingHoursCodec.toCommon` / `fromCommon`), so what the app saves is what the marketplace enforces.
 */

/** Day names and `HH:mm`, in the store's local time. */
export interface OperatingHours {
  days: string[];
  opensAt: string;
  closesAt: string;
}

/** Common's shape: day key to a list of `[opens, closes]` windows. */
export type CommonOperatingHours = Record<string, string[][]>;

const APP_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const COMMON_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/**
 * What the marketplace applies to a store with no hours on file: every day, 10:00 to 21:00
 * (`OperatingHours.defaults()` in the Marketplace API). Shown as such rather than as "not set", because it is what
 * restaurants are held to.
 */
export const DEFAULT_HOURS: OperatingHours = { days: [...APP_DAYS], opensAt: '10:00', closesAt: '21:00' };

/** One window on each chosen day, in the week's order. Days the app does not know are dropped. */
export function toCommonHours(hours: OperatingHours): CommonOperatingHours {
  const chosen = new Set(hours.days.map((day) => day.trim().toUpperCase()));
  const out: CommonOperatingHours = {};
  APP_DAYS.forEach((day, i) => {
    if (chosen.has(day) || chosen.has(day.slice(0, 3))) {
      out[COMMON_DAYS[i] as string] = [[hours.opensAt, hours.closesAt]];
    }
  });
  return out;
}

/**
 * The app's single window from common's hours: every day that has a window, and the first open day's first window
 * (the store screen edits one window for all days). Missing, empty or unreadable hours give {@link DEFAULT_HOURS}; the
 * older `{days, opensAt, closesAt}` shape is read as it is.
 */
export function fromCommonHours(raw: unknown): OperatingHours {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_HOURS, days: [...DEFAULT_HOURS.days] };
  }
  const value = raw as Record<string, unknown>;

  if ('days' in value || 'opensAt' in value) {
    const days = Array.isArray(value.days) ? value.days.map((d) => String(d).toUpperCase()) : [];
    return {
      days: APP_DAYS.filter((day) => days.includes(day)),
      opensAt: typeof value.opensAt === 'string' ? value.opensAt : DEFAULT_HOURS.opensAt,
      closesAt: typeof value.closesAt === 'string' ? value.closesAt : DEFAULT_HOURS.closesAt,
    };
  }

  const days: string[] = [];
  let opensAt: string | null = null;
  let closesAt: string | null = null;
  for (let i = 0; i < COMMON_DAYS.length; i++) {
    const windows = value[COMMON_DAYS[i] as string];
    if (!Array.isArray(windows) || windows.length === 0) continue;
    const first: unknown = windows[0];
    if (!Array.isArray(first) || first.length < 2) continue;
    days.push(APP_DAYS[i] as string);
    if (opensAt == null) {
      opensAt = String(first[0]);
      closesAt = String(first[1]);
    }
  }
  if (days.length === 0 || opensAt == null || closesAt == null) {
    return { ...DEFAULT_HOURS, days: [...DEFAULT_HOURS.days] };
  }
  return { days, opensAt, closesAt };
}
