import type { StatementFormat, StatementRequest } from '@/models/wallet';

/** The longest window a statement covers, counting both end days. Matches the server. */
export const MAX_STATEMENT_DAYS = 366;

const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, '0');

/** `yyyy-MM-dd` for a date, in the device's zone. */
export function isoDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * A `yyyy-MM-dd` as a day number, or null when it is not a real calendar day
 * (2026-02-30 is not, and `new Date` would quietly turn it into March).
 *
 * <p>Day numbers, not local `Date`s: subtracting two local midnights across a clock
 * change is 23 or 25 hours, and "366 days" must not depend on the time of year.
 */
function dayNumber(text: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const utc = new Date(Date.UTC(y, m - 1, d));
  if (utc.getUTCFullYear() !== y || utc.getUTCMonth() !== m - 1 || utc.getUTCDate() !== d) return null;
  return Math.round(utc.getTime() / DAY_MS);
}

/** Whether the text is a real `yyyy-MM-dd` day. */
export function isValidDay(text: string): boolean {
  return dayNumber(text) != null;
}

export interface FinancialYear {
  /** As the API takes it: `2025-26`. */
  key: string;
  label: string;
}

/**
 * The financial years to offer, the current one first. Indian financial years run
 * 1 April to 31 March, so in January 2027 the current year is still `2026-27`.
 */
export function financialYears(now = new Date(), count = 5): FinancialYear[] {
  const start = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return Array.from({ length: count }, (_, i) => {
    const from = start - i;
    const key = `${from}-${pad((from + 1) % 100)}`;
    return { key, label: `FY ${key}` };
  });
}

/**
 * Why a statement cannot be asked for, in words for the person, or null when it can.
 *
 * <p>The server checks the same things and has the last word; this only saves a trip
 * for the mistakes a person makes with a date box.
 */
export function validateStatement(request: StatementRequest, now = new Date()): string | null {
  if (request.kind === 'range') return null;

  if (request.kind === 'financialYear') {
    const match = /^(\d{4})-(\d{2})$/.exec(request.financialYear);
    if (!match || (Number(match[1]) + 1) % 100 !== Number(match[2])) return 'Choose a financial year.';
    const current = Number(financialYears(now, 1)[0]!.key.slice(0, 4));
    return Number(match[1]) > current ? 'That financial year has not started.' : null;
  }

  if (request.from.trim() === '' || request.to.trim() === '') return 'Choose both dates.';
  const from = dayNumber(request.from);
  const to = dayNumber(request.to);
  if (from == null || to == null) return 'Use the form 2026-09-16 for both dates.';
  if (from > to) return '"From" must be on or before "To".';
  if (to > (dayNumber(isoDay(now)) as number)) return 'Dates cannot be in the future.';
  if (to - from + 1 > MAX_STATEMENT_DAYS) return `A statement covers at most ${MAX_STATEMENT_DAYS} days.`;
  return null;
}

/** `?range=…&format=…`, as the statement endpoint takes it. */
export function buildStatementQuery(request: StatementRequest): string {
  const parts: string[] = [];
  if (request.kind === 'range') parts.push(`range=${request.range}`);
  else if (request.kind === 'custom') {
    parts.push('range=CUSTOM', `from=${encodeURIComponent(request.from.trim())}`,
      `to=${encodeURIComponent(request.to.trim())}`);
  } else parts.push(`financialYear=${encodeURIComponent(request.financialYear)}`);
  parts.push(`format=${request.format}`);
  return `?${parts.join('&')}`;
}

export function fallbackFileName(format: StatementFormat, now = new Date()): string {
  return `wallet-statement-${isoDay(now)}.${format.toLowerCase()}`;
}

/**
 * The file's name from a `Content-Disposition` header, or the fallback.
 *
 * <p>Takes `filename*=UTF-8''…` over `filename="…"`, and drops any directory part:
 * the name goes to the download dialog, and a header saying `../../x` must not.
 */
export function fileNameFromDisposition(header: string | null | undefined, fallback: string): string {
  if (!header) return fallback;

  let name: string | null = null;
  const extended = /filename\*\s*=\s*(?:[\w-]+)?'[^']*'([^;]+)/i.exec(header);
  if (extended?.[1]) {
    try { name = decodeURIComponent(extended[1].trim().replace(/^"|"$/g, '')); } catch { name = null; }
  }
  if (name == null) {
    const quoted = /filename\s*=\s*"([^"]*)"/i.exec(header);
    const bare = /filename\s*=\s*([^;\s]+)/i.exec(header);
    name = quoted?.[1] ?? bare?.[1] ?? null;
  }
  if (name == null) return fallback;

  const clean = name.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f]/g, '').trim();
  return clean === '' || clean === '.' || clean === '..' ? fallback : clean;
}
