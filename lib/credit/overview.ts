import type { CreditAgreement } from '@/models/credit';

/** The name a restaurant knows this supplier by. */
export function agreementName(a: Pick<CreditAgreement, 'supplierName' | 'storeName'>): string {
  return a.supplierName ?? a.storeName ?? 'Supplier';
}

const positive = (v: string | number | null | undefined): boolean => Number(v) > 0;

/** Whether this agreement owes anything (a comparison, not arithmetic). */
export function owesAnything(a: Pick<CreditAgreement, 'due' | 'overdue'>): boolean {
  return positive(a.due) || positive(a.overdue);
}

/**
 * Overdue first, then the earliest next due date, then name.
 *
 * <p>'YYYY-MM-DD' strings sort lexicographically; this is ordering, not date
 * arithmetic. A missing date sorts after a present one.
 */
export function compareDues(a: CreditAgreement, b: CreditAgreement): number {
  const ao = positive(a.overdue) ? 0 : 1;
  const bo = positive(b.overdue) ? 0 : 1;
  if (ao !== bo) return ao - bo;
  const ad = a.nextDueDate ?? null;
  const bd = b.nextDueDate ?? null;
  if (ad !== bd) {
    if (ad == null) return 1;
    if (bd == null) return -1;
    return ad < bd ? -1 : 1;
  }
  return agreementName(a).localeCompare(agreementName(b));
}

export interface OverviewGroups {
  /** Agreements that owe money, in the order to show them. */
  dues: CreditAgreement[];
  /** Everything else, in server order. */
  lines: CreditAgreement[];
}

export function groupAgreements(agreements: CreditAgreement[]): OverviewGroups {
  return {
    dues: agreements.filter(owesAnything).sort(compareDues),
    lines: agreements.filter((a) => !owesAnything(a)),
  };
}

/** True when there is at least one agreement and every one is suspended. */
export function allSuspended(agreements: CreditAgreement[]): boolean {
  return agreements.length > 0 && agreements.every((a) => a.status === 'SUSPENDED');
}

/** The one-line reason a line cannot be used, when the server carries it. */
export function rejectionReason(a: CreditAgreement): string | null {
  return a.latestRequest?.responseNote ?? null;
}

export interface CreditMeter {
  /** 0 to 100: the share of the approved limit that is in use, for the hero's bar. */
  percent: number;
}

/**
 * How much of the approved limit is in use, for the thin bar on the hero.
 *
 * <p>Used is the limit less what is still available, both the server's numbers.
 * Null when either is unreadable, and the hero then shows no bar. Clamped: more
 * available than the limit is an empty bar, negative available a full one, and a
 * limit of zero is empty (nothing to use).
 */
export function creditMeter(
  approvedLimit: string | number | null | undefined,
  available: string | number | null | undefined,
): CreditMeter | null {
  if (approvedLimit == null || approvedLimit === '' || available == null || available === '') return null;
  const limit = Number(approvedLimit);
  const free = Number(available);
  if (!Number.isFinite(limit) || !Number.isFinite(free)) return null;
  if (limit <= 0) return { percent: 0 };
  const used = limit - free;
  return { percent: Math.min(100, Math.max(0, (used / limit) * 100)) };
}
