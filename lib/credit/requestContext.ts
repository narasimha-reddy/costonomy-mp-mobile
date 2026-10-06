import type { ApproveCreditInput } from '@/services/credit';
import type { CreditAgreement } from '@/models/credit';
import type { CreditPolicy, RequestContext, RequestHistoryEvent } from '@/models/creditRequest';
import { formatDay, relative } from '@/utils/dateRange';
import { formatMoney } from '@/utils/money';

/** Quick reasons for declining; "Other" leaves the box empty for the supplier's own words. */
export const DECLINE_REASONS = [
  'Not enough order history',
  'Limit not available now',
  'Prefer to be paid upfront',
  'Other',
] as const;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "28 Jun" from 'YYYY-MM-DD' (the year only when it is not the year the figures are for). Read as text, so no time zone shifts it. */
function shortDay(iso: string, asOf: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m == null) return null;
  const month = MONTHS[Number(m[2]) - 1];
  if (month == null) return null;
  const year = m[1] === asOf.slice(0, 4) ? '' : ` ${m[1]}`;
  return `${Number(m[3])} ${month}${year}`;
}

/** The same for a server instant, as the day it falls on for the person holding the phone. */
function shortMoment(iso: string | null, asOf: string): string | null {
  if (iso == null) return null;
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return null;
  const year = String(when.getFullYear()) === asOf.slice(0, 4) ? '' : ` ${when.getFullYear()}`;
  return `${when.getDate()} ${MONTHS[when.getMonth()]}${year}`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export interface ContextLines {
  orders: string;
  dates: string | null;
  cancelled: string | null;
  overdue: string | null;
  past: string | null;
}

/**
 * The context card in plain words. Every figure is the server's, shown as sent: no
 * average, total or day count is worked out here.
 */
export function contextLines(c: RequestContext): ContextLines {
  const none = c.ordersCount90d === 0;
  const average = c.averageOrderValue != null ? ` (average ${formatMoney(c.averageOrderValue, true)})` : '';
  const orders = none
    ? 'No orders with you yet'
    : `Ordered ${plural(c.ordersCount90d, 'time', 'times')} in the last ${c.windowDays} days, ${formatMoney(c.ordersValue90d, true)} in total${average}.`;

  const first = c.firstOrderDate != null ? shortDay(c.firstOrderDate, c.asOf) : null;
  const last = c.lastOrderDate != null ? shortDay(c.lastOrderDate, c.asOf) : null;
  const dates = first != null && last != null ? `First order ${first}, last ${last}.` : null;

  const cancelled = c.cancelledOrders90d > 0 ? `${plural(c.cancelledOrders90d, 'cancelled order', 'cancelled orders')}.` : null;
  const overdue = c.previousOverdueCount > 0
    ? `${plural(c.previousOverdueCount, 'earlier invoice', 'earlier invoices')} of theirs with you went overdue.`
    : null;

  const on = shortMoment(c.pastLineEndedAt, c.asOf);
  const when = on != null ? ` on ${on}` : '';
  let past: string | null = null;
  if (c.pastLineStatus === 'CLOSED') past = `Earlier credit line with you was closed${when}.`;
  else if (c.pastLineStatus === 'REJECTED') past = `You declined an earlier request${when}.`;
  else if (c.pastLineStatus === 'EXPIRED') past = `An earlier offer to them expired${when}.`;

  return { orders, dates, cancelled, overdue, past };
}

const EVENT_LABELS: Record<string, string> = {
  REQUESTED: 'Requested',
  APPROVED: 'Approved',
  MODIFIED: 'Terms changed',
  REJECTED: 'Declined',
  SUSPENDED: 'Paused',
  REINSTATED: 'Reinstated',
  CLOSED: 'Closed',
  EXPIRED: 'Offer expired',
};

export interface HistoryRow { label: string; when: string; note: string | null }

/** The line's history in the order the server sent it (newest first). An unknown event is shown, not dropped. */
export function historyLines(history: RequestHistoryEvent[]): HistoryRow[] {
  return history.map((h) => ({
    label: EVENT_LABELS[h.event] ?? (h.event.charAt(0) + h.event.slice(1).toLowerCase()),
    when: formatDay(h.at) ?? '',
    note: h.note != null && h.note !== '' ? h.note : null,
  }));
}

/** A money value as a person would type it: "25000", not "25000.0000". */
function plain(amount: string | number): string {
  const text = String(amount);
  return text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text;
}

/**
 * The store's usual terms as the approve body, or null when the policy has no limit or
 * period to offer. This is what the supplier sees in the preview and exactly what is sent.
 */
export function usualTerms(policy: CreditPolicy | null | undefined): ApproveCreditInput | null {
  if (policy == null) return null;
  const limit = policy.defaultCreditLimit;
  const days = policy.defaultCreditPeriodDays;
  if (limit == null || Number(limit) <= 0 || days == null || days <= 0) return null;
  return {
    approvedLimit: plain(limit),
    creditPeriodDays: days,
    ...(policy.defaultGracePeriodDays != null ? { gracePeriodDays: policy.defaultGracePeriodDays } : {}),
    ...(policy.maxSingleOrderCredit != null ? { maxSingleOrderCredit: plain(policy.maxSingleOrderCredit) } : {}),
    ...(policy.maxOverdueAmount != null ? { maxOverdueAmount: plain(policy.maxOverdueAmount) } : {}),
  };
}

/** The terms in words, one line each, from the body that will be sent. */
export function usualTermsPreview(terms: ApproveCreditInput): string[] {
  const lines: string[] = [];
  if (terms.approvedLimit != null) lines.push(`Limit ${formatMoney(terms.approvedLimit, true)}`);
  if (terms.creditPeriodDays != null) lines.push(`Pay within ${plural(terms.creditPeriodDays, 'day', 'days')}`);
  if (terms.gracePeriodDays != null) lines.push(`Grace ${plural(terms.gracePeriodDays, 'day', 'days')}`);
  if (terms.maxSingleOrderCredit != null) lines.push(`Per-order cap ${formatMoney(terms.maxSingleOrderCredit, true)}`);
  if (terms.maxOverdueAmount != null) lines.push(`Pause when overdue passes ${formatMoney(terms.maxOverdueAmount, true)}`);
  return lines;
}

/** Where an offer stands, for the requests list: waiting on the restaurant, or lapsed. Null for anything else. */
export function offerWording(a: Pick<CreditAgreement, 'status' | 'offerExpiresOn'>): string | null {
  if (a.status === 'APPROVED') {
    const until = formatDay(a.offerExpiresOn);
    return `Offer sent, waiting for the restaurant${until != null ? ` (valid until ${until})` : ''}`;
  }
  if (a.status === 'EXPIRED') return 'Offer expired';
  return null;
}

/** "Waiting 3 days", from the server's timestamp for when the request was made. */
export function waitingWording(createdAt: string | null | undefined, now: Date): string | null {
  if (createdAt == null || Number.isNaN(new Date(createdAt).getTime())) return null;
  return `Waiting ${relative(new Date(createdAt), now).replace(/ ago$/, '')}`;
}

/** Oldest first; a row with no date goes last. Stable. */
export function oldestFirst<T>(rows: T[], when: (row: T) => string | null | undefined): T[] {
  const stamp = (row: T) => {
    const t = Date.parse(when(row) ?? '');
    return Number.isNaN(t) ? Infinity : t;
  };
  return rows
    .map((row, i) => ({ row, i, t: stamp(row) }))
    .sort((a, b) => (a.t === b.t ? a.i - b.i : a.t < b.t ? -1 : 1))
    .map((x) => x.row);
}
