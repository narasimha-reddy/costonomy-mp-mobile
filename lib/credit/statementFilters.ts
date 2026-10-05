import type { CreditStatementLine } from '@/models/credit';
import { monthChoices } from '@/lib/wallet/history';
import {
  RANGE_TOO_WIDE, isRepayment, istDay, presetRange,
} from '@/lib/credit/statement';

/** The longest range the server accepts, in days. */
export const MAX_RANGE_DAYS = 366;

const DAY_MS = 24 * 60 * 60 * 1000;

export type PeriodPreset = 'd30' | 'd90' | 'd180' | 'd365';
export type StatementType = 'ORDERS' | 'REPAYMENTS';
export type PaidBy = 'WALLET' | 'UPI' | 'BANK_TRANSFER' | 'CASH' | 'CHEQUE' | 'CARD';

/** Period quick choices; the server's own default (last 90 days) is `DEFAULT_PRESET`. */
export const PERIOD_PRESETS: { key: PeriodPreset; label: string; days: number }[] = [
  { key: 'd30', label: 'Last 30 days', days: 30 },
  { key: 'd90', label: 'Last 90 days', days: 90 },
  { key: 'd180', label: 'Last 6 months', days: 180 },
  { key: 'd365', label: 'Last year', days: 365 },
];
export const DEFAULT_PRESET: PeriodPreset = 'd90';

export const TYPE_OPTIONS: { key: StatementType; label: string }[] = [
  { key: 'ORDERS', label: 'Orders on credit' },
  { key: 'REPAYMENTS', label: 'Repayments' },
];

export const PAID_BY_OPTIONS: { key: PaidBy; label: string }[] = [
  { key: 'WALLET', label: 'Wallet' },
  { key: 'UPI', label: 'UPI' },
  { key: 'BANK_TRANSFER', label: 'Bank transfer' },
  { key: 'CASH', label: 'Cash' },
  { key: 'CHEQUE', label: 'Cheque' },
  { key: 'CARD', label: 'Card' },
];

/**
 * What narrows the statement. `preset` and `months` are the period (months win when any are
 * ticked); the period goes to the server, `types` and `paidBy` narrow the loaded lines.
 */
export interface StatementFilters {
  preset: PeriodPreset;
  /** `yyyy-MM`, India months. */
  months: string[];
  types: StatementType[];
  paidBy: PaidBy[];
}

export const NO_STATEMENT_FILTERS: StatementFilters = {
  preset: DEFAULT_PRESET, months: [], types: [], paidBy: [],
};

export type StatementFilterSection = 'period' | 'types' | 'paidBy';

export type StatementFilterAction =
  | { type: 'toggle'; section: StatementFilterSection; value: string }
  | { type: 'clear' };

const isPreset = (v: string): v is PeriodPreset => PERIOD_PRESETS.some((p) => p.key === v);

/**
 * Tick or untick one choice. In `period` a preset is picked (it replaces any months) and a
 * month is toggled (it replaces the preset, which falls back to the default).
 */
export function statementFilterReducer(
  state: StatementFilters, action: StatementFilterAction,
): StatementFilters {
  if (action.type === 'clear') return NO_STATEMENT_FILTERS;
  if (action.section === 'period') {
    if (isPreset(action.value)) return { ...state, preset: action.value, months: [] };
    const months = state.months.includes(action.value)
      ? state.months.filter((m) => m !== action.value)
      : [...state.months, action.value];
    return { ...state, preset: DEFAULT_PRESET, months };
  }
  const current = state[action.section] as string[];
  const next = current.includes(action.value)
    ? current.filter((v) => v !== action.value)
    : [...current, action.value];
  return { ...state, [action.section]: next };
}

/** The period part alone: how many choices it holds (months, or a non-default preset as one). */
export function periodCount(filters: StatementFilters): number {
  return filters.months.length > 0 ? filters.months.length : filters.preset === DEFAULT_PRESET ? 0 : 1;
}

/** Active filters, for the badge: the default period is not a filter. */
export function statementFilterCount(filters: StatementFilters): number {
  return periodCount(filters) + filters.types.length + filters.paidBy.length;
}

/** Whether Apply is live: the choices differ from what is applied, or something can be cleared. */
export function canApplyStatement(state: StatementFilters, applied: StatementFilters): boolean {
  return JSON.stringify(state) !== JSON.stringify(applied) || statementFilterCount(applied) > 0;
}

// ── Period → from/to ──────────────────────────────────────────────────

function lastDayOfMonth(month: string): string {
  const [y = 0, m = 1] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(d).padStart(2, '0')}`;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
}

/**
 * First day of the earliest month to the last day of the latest, in India time; the end is cut
 * to today when that month is still running. Null for no months.
 */
export function monthsRange(months: string[], now: Date = new Date()): { from: string; to: string } | null {
  if (months.length === 0) return null;
  const sorted = [...months].sort();
  const from = `${sorted[0]}-01`;
  let to = lastDayOfMonth(sorted[sorted.length - 1] as string);
  const today = istDay(now) as string;
  if (to > today) to = today;
  return { from, to: to < from ? from : to };
}

/** Whether a range is longer than the server accepts. */
export function rangeTooWide(range: { from: string; to: string }): boolean {
  return daysBetween(range.from, range.to) > MAX_RANGE_DAYS;
}

/** The message shown when a range is too wide. */
export const RANGE_MESSAGE = RANGE_TOO_WIDE;

/**
 * What to ask the server: null for the default (last 90 days, no query string), else the
 * India-time days. A range wider than a year is cut to its last 366 days and `clipped` says so.
 */
export function statementRange(
  filters: StatementFilters, now: Date = new Date(),
): { range: { from: string; to: string } | null; clipped: boolean } {
  let range: { from: string; to: string } | null;
  if (filters.months.length > 0) range = monthsRange(filters.months, now);
  else if (filters.preset === DEFAULT_PRESET) range = null;
  else range = presetRange(PERIOD_PRESETS.find((p) => p.key === filters.preset)?.days ?? 90, now);
  if (range == null || !rangeTooWide(range)) return { range, clipped: false };
  const from = istDay(Date.parse(`${range.to}T00:00:00Z`) - (MAX_RANGE_DAYS - 1) * DAY_MS) as string;
  return { range: { from, to: range.to }, clipped: true };
}

// ── Route params ──────────────────────────────────────────────────────

export function statementFiltersToParams(filters: StatementFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.months.length > 0) params.months = [...filters.months].sort().join(',');
  else if (filters.preset !== DEFAULT_PRESET) params.period = filters.preset;
  if (filters.types.length > 0) params.types = filters.types.join(',');
  if (filters.paidBy.length > 0) params.paidBy = filters.paidBy.join(',');
  return params;
}

/** Spread under `statementFiltersToParams` so a removed section really clears in the route. */
export const EMPTY_STATEMENT_PARAMS = { period: '', months: '', types: '', paidBy: '' } as const;

function first(raw: string | string[] | undefined): string {
  return (Array.isArray(raw) ? raw[0] : raw) ?? '';
}

function pick<T extends string>(raw: string | string[] | undefined, allowed: readonly T[]): T[] {
  const text = first(raw);
  if (!text) return [];
  return text.split(',').filter((v): v is T => (allowed as readonly string[]).includes(v));
}

/** Route params back into filters; anything unrecognised is dropped, absent means the defaults. */
export function statementFiltersFromParams(
  params: Record<string, string | string[] | undefined>,
): StatementFilters {
  const period = first(params.period);
  return {
    preset: isPreset(period) ? period : DEFAULT_PRESET,
    months: first(params.months).split(',').filter((m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m)),
    types: pick(params.types, TYPE_OPTIONS.map((o) => o.key)),
    paidBy: pick(params.paidBy, PAID_BY_OPTIONS.map((o) => o.key)),
  };
}

// ── Narrowing the loaded lines ────────────────────────────────────────

/** Which "Paid by" a repayment line is: its wallet source, else its method. Null for non-repayments. */
export function paidByOf(line: CreditStatementLine): PaidBy | null {
  if (!isRepayment(line)) return null;
  if (line.source === 'WALLET') return 'WALLET';
  const m = (line.method ?? '').toUpperCase().replace(/[\s-]+/g, '_');
  if (m === 'UPI') return 'UPI';
  if (m === 'BANK_TRANSFER' || m === 'NEFT' || m === 'RTGS' || m === 'IMPS') return 'BANK_TRANSFER';
  if (m === 'CASH' || m === 'CHEQUE' || m === 'CARD') return m;
  return null;
}

/**
 * Lines that pass Type and Paid by. Orders are the lines the supplier drew on credit
 * (UTILIZE), repayments the REPAYMENT ones; "Paid by" only ever matches repayments. Sections
 * combine with AND, choices within one with OR; nothing chosen keeps everything.
 */
export function applyLineFilters(
  lines: CreditStatementLine[], filters: Pick<StatementFilters, 'types' | 'paidBy'>,
): CreditStatementLine[] {
  const { types, paidBy } = filters;
  if (types.length === 0 && paidBy.length === 0) return lines;
  return lines.filter((line) => {
    if (types.length > 0) {
      const kind: StatementType | null = isRepayment(line) ? 'REPAYMENTS' : line.type === 'UTILIZE' ? 'ORDERS' : null;
      if (kind == null || !types.includes(kind)) return false;
    }
    if (paidBy.length > 0) {
      const how = paidByOf(line);
      if (how == null || !paidBy.includes(how)) return false;
    }
    return true;
  });
}

/** The months on offer under Period: the last twelve, newest first, plus any ticked; none greyed out. */
export function periodMonthChoices(selected: string[], now: Date = new Date()): { month: string; label: string }[] {
  return monthChoices([], selected, now).map(({ month, label }) => ({ month, label }));
}
