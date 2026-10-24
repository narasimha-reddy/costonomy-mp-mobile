import type {
  Ageing, AgeingBucketKey, PendingAction, PendingActionKind, ReceivablesSort,
} from '@/models/credit';

/**
 * Drawing helpers for the supplier's receivables screens.
 *
 * <p>Every rupee figure is the server's. The ratios below exist only to size a
 * bar; they are never shown as money.
 */

/** A share of a whole for a bar's width, clamped to 0..100. Null when there is nothing to measure against. */
export function barPercent(part: number | null | undefined, whole: number | null | undefined): number | null {
  if (part == null || whole == null || !Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null;
  return Math.min(100, Math.max(0, (part / whole) * 100));
}

export interface AgeingSegment {
  bucket: AgeingBucketKey;
  /** 0..100 of the stacked bar. */
  percent: number;
}

/** The stacked bar: each bucket's server amount over the server's total, in the server's order. */
export function ageingSegments(ageing: Ageing): AgeingSegment[] {
  return ageing.buckets.map((b) => ({ bucket: b.bucket, percent: barPercent(b.amount, ageing.total) ?? 0 }));
}

export const AGEING_COPY: Record<AgeingBucketKey, { title: string; line: string }> = {
  CURRENT: { title: 'Current', line: 'Not due yet' },
  D1_7: { title: '1 to 7 days', line: '1 to 7 days late' },
  D8_30: { title: '8 to 30 days', line: '8 to 30 days late' },
  D30_PLUS: { title: '30+ days', line: 'More than 30 days late' },
};

export interface PendingActionTarget {
  /** A screen to open. */
  route?: string;
  /** Or a part of the home screen to bring into view. */
  scroll?: 'requests' | 'list';
  /** The list's sort to switch to when scrolling to the list. */
  sort?: ReceivablesSort;
}

export interface PendingActionView {
  kind: PendingActionKind;
  label: string;
  target: PendingActionTarget;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Words and destination for one thing the server says needs doing. A kind this
 * app was not taught, or a zero count, yields null: nothing is invented.
 */
export function pendingActionView(action: PendingAction): PendingActionView | null {
  const n = action.count;
  if (!(n > 0)) return null;
  switch (action.kind) {
    case 'CLAIMS_WAITING':
      return { kind: action.kind, label: `${plural(n, 'payment', 'payments')} waiting for your OK`, target: { route: '/supplier/credit/claims' } };
    case 'REQUESTS_PENDING':
      return { kind: action.kind, label: `${plural(n, 'new credit request', 'new credit requests')}`, target: { scroll: 'requests' } };
    case 'OVERDUE_RESTAURANTS':
      return { kind: action.kind, label: `${plural(n, 'restaurant', 'restaurants')} overdue`, target: { scroll: 'list', sort: 'overdue' } };
    case 'LINE_AT_LIMIT':
      // The server has no utilisation sort; "owes most" brings the lines nearest their limit up front.
      return { kind: action.kind, label: `${plural(n, 'line', 'lines')} at ${n === 1 ? 'its' : 'their'} limit`, target: { scroll: 'list', sort: 'owed' } };
    default:
      return null;
  }
}

/** Outlet first (that is what a supplier delivers to), restaurant second. */
export function restaurantLabel(
  r: { outletName: string | null | undefined; restaurantName: string | null | undefined },
): { primary: string; secondary: string | null } {
  const outlet = r.outletName ?? null;
  const restaurant = r.restaurantName ?? null;
  if (outlet != null) return { primary: outlet, secondary: restaurant };
  return { primary: restaurant ?? 'Restaurant', secondary: null };
}
