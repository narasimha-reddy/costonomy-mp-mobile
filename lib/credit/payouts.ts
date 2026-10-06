import type { CreditPayout, PayoutStatus, StorePaymentSource } from '@/models/credit';
import { claimMethodLabel } from '@/lib/credit/claims';
import { istDay, presetRange } from '@/lib/credit/statement';
import {
  PERIOD_PRESETS, monthsRange, rangeTooWide, type PeriodPreset,
} from '@/lib/credit/statementFilters';
import { formatGstRate, formatMoney } from '@/utils/money';

/** What the supplier reads under a payout that is not yet in a settlement. */
export const PAYOUT_EXPLANATION =
  'This is money your restaurant paid from their Mandi wallet. We pay it to you in your next settlement.';

export const PAGE_SIZE = 20;

/** Pending first: it is the money still to come. */
const GROUPS: { status: PayoutStatus; title: string }[] = [
  { status: 'PENDING', title: 'Pending' },
  { status: 'APPLIED', title: 'Paid out' },
];

export function payoutStatusLabel(status: PayoutStatus): string {
  return GROUPS.find((g) => g.status === status)?.title ?? status;
}

/** Splits by the status the server sent; it never works a status out for itself. Empty groups are left out. */
export function groupPayouts(items: readonly CreditPayout[]): { status: PayoutStatus; title: string; items: CreditPayout[] }[] {
  return GROUPS
    .map((g) => ({ ...g, items: items.filter((i) => i.status === g.status) }))
    .filter((g) => g.items.length > 0);
}

/** "Mandi fee ₹100.00 (2%)"; without the bracket when the server sent no rate. */
export function feeLine(payout: Pick<CreditPayout, 'commissionAmount' | 'commissionRatePercent'>): string {
  const fee = `Mandi fee ${formatMoney(payout.commissionAmount)}`;
  return payout.commissionRatePercent == null ? fee : `${fee} (${formatGstRate(payout.commissionRatePercent)})`;
}

export function paymentSourceLabel(source: StorePaymentSource): string {
  switch (source) {
    case 'SUPPLIER_RECORDED': return 'Recorded by you';
    case 'CLAIM_CONFIRMED': return 'Confirmed from their claim';
    case 'WALLET': return 'Mandi wallet';
    default: return String(source);
  }
}

/** "UPI · UTR123", or just the method, or just the reference, or null. */
export function methodAndReference(method: string | null, reference: string | null): string | null {
  const parts = [
    method != null && method !== '' ? claimMethodLabel(method) : null,
    reference != null && reference !== '' ? reference : null,
  ].filter((p): p is string => p != null);
  return parts.length === 0 ? null : parts.join(' · ');
}

// ── Period filter ─────────────────────────────────────────────────────
// Same Period choices as the statement and the wallet, but with no default: until the
// supplier picks one the server is asked for everything, so a pending payout never hides.

export interface PayoutFilters {
  period: PeriodPreset | null;
  /** `yyyy-MM`, India months. */
  months: string[];
}

export const NO_PAYOUT_FILTERS: PayoutFilters = { period: null, months: [] };

export type PayoutFilterAction = { type: 'toggle'; value: string } | { type: 'clear' };

const isPreset = (v: string): v is PeriodPreset => PERIOD_PRESETS.some((p) => p.key === v);

/** Tick or untick: a preset replaces any months, a month replaces the preset. */
export function payoutReducer(state: PayoutFilters, action: PayoutFilterAction): PayoutFilters {
  if (action.type === 'clear') return NO_PAYOUT_FILTERS;
  if (isPreset(action.value)) {
    return state.period === action.value ? NO_PAYOUT_FILTERS : { period: action.value, months: [] };
  }
  const months = state.months.includes(action.value)
    ? state.months.filter((m) => m !== action.value)
    : [...state.months, action.value];
  return { period: null, months };
}

export function payoutFilterCount(filters: PayoutFilters): number {
  return filters.months.length > 0 ? filters.months.length : filters.period != null ? 1 : 0;
}

/** What to ask the server: null for no limit, else India days. A range over a year is cut to its last year. */
export function payoutRange(filters: PayoutFilters, now: Date = new Date()): { from: string; to: string } | null {
  let range: { from: string; to: string } | null = null;
  if (filters.months.length > 0) range = monthsRange(filters.months, now);
  else if (filters.period != null) {
    range = presetRange(PERIOD_PRESETS.find((p) => p.key === filters.period)?.days ?? 90, now);
  }
  if (range == null || !rangeTooWide(range)) return range;
  const from = istDay(Date.parse(`${range.to}T00:00:00Z`) - 365 * 24 * 60 * 60 * 1000) as string;
  return { from, to: range.to };
}

export function payoutFiltersToParams(filters: PayoutFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.months.length > 0) params.months = [...filters.months].sort().join(',');
  else if (filters.period != null) params.period = filters.period;
  return params;
}

/** Spread under `payoutFiltersToParams` so a removed filter really clears in the route. */
export const EMPTY_PAYOUT_PARAMS = { period: '', months: '' } as const;

const first = (raw: string | string[] | undefined): string => (Array.isArray(raw) ? raw[0] : raw) ?? '';

export function payoutFiltersFromParams(params: Record<string, string | string[] | undefined>): PayoutFilters {
  const period = first(params.period);
  const months = first(params.months).split(',').filter((m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m)).sort();
  if (months.length > 0) return { period: null, months };
  return { period: isPreset(period) ? period : null, months: [] };
}
