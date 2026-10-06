import { ApiError } from '@/lib/api/errors';
import { istMonthKey, monthTitle } from '@/lib/wallet/history';
import { formatMoney } from '@/utils/money';
import type { CreditStatementLine } from '@/models/credit';

/** What the screen shows when the server turns a range down (400). */
export const RANGE_TOO_WIDE = 'Choose a range of up to a year';

export interface StatementMonth {
  /** `yyyy-MM` in India time; '' for lines whose time cannot be read. */
  month: string;
  title: string;
  lines: CreditStatementLine[];
}

/**
 * The statement cut into months, in the order the server sent them (newest first).
 *
 * <p>Months are India months, because the server cuts its days at IST midnight: a line
 * at 23:30 IST on 31 October belongs to October even though it is already 1 November in
 * UTC. Grouping is presentation only; no figure is added up here.
 */
export function groupStatementByMonth(lines: CreditStatementLine[]): StatementMonth[] {
  const groups = new Map<string, CreditStatementLine[]>();
  for (const line of lines) {
    const key = istMonthKey(line.at) ?? '';
    const list = groups.get(key);
    if (list) list.push(line); else groups.set(key, [line]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : b.localeCompare(a)))
    .map(([month, list]) => ({ month, title: monthTitle(month), lines: list }));
}

/** A repayment reduces what is owed; every other line adds to it or is neutral. */
export function isRepayment(line: Pick<CreditStatementLine, 'type'>): boolean {
  return line.type === 'REPAYMENT';
}

/**
 * The amount with an explicit sign taken from the server's own sign: "+₹1,200.00" for an
 * order, "−₹500.00" for a repayment. Taking the magnitude is formatting, not arithmetic.
 */
export function signedAmount(amount: string | number | null | undefined): string {
  const n = amount == null || amount === '' ? NaN : Number(amount);
  if (!Number.isFinite(n)) return '—';
  if (n < 0) return `−${formatMoney(Math.abs(n))}`;
  if (n > 0) return `+${formatMoney(n)}`;
  return formatMoney(0);
}

function sentence(raw: string): string {
  const words = raw.replace(/_/g, ' ').trim().toLowerCase();
  return words === '' ? '' : words.charAt(0).toUpperCase() + words.slice(1);
}

const METHOD_LABELS: Record<string, string> = { UPI: 'UPI', NEFT: 'NEFT', RTGS: 'RTGS', IMPS: 'IMPS' };

export function methodLabel(method: string): string {
  return METHOD_LABELS[method.toUpperCase()] ?? sentence(method);
}

/**
 * The small line under a row's label: the invoice number, and for a repayment the word
 * "Repayment" and how it was paid ("From wallet", "UPI · ref 123", "Bank transfer").
 */
export function statementDetail(line: CreditStatementLine): string {
  const parts: string[] = [];
  if (line.invoiceNumber) parts.push(line.invoiceNumber);
  if (isRepayment(line)) {
    parts.push('Repayment');
    if (line.source === 'WALLET') {
      parts.push('From wallet');
    } else {
      if (line.method) parts.push(methodLabel(line.method));
      if (line.reference) parts.push(`ref ${line.reference}`);
    }
  }
  if (line.type === 'PAYMENT_REVERSED') parts.push('Payment cancelled, owed again');
  // "UPI · ref 123" reads as one phrase; the rest are separate facts.
  return parts.join(' · ');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "5 Jul" from '2026-07-05'; the year is added when `withYear` is set. */
export function dayLabel(day: string, withYear = false): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const name = m ? MONTHS[Number(m[2]) - 1] : undefined;
  if (!m || !name) return day;
  return `${Number(m[3])} ${name}${withYear ? ` ${m[1]}` : ''}`;
}

/** "5 Jul to 3 Oct"; with the years when the range spans two. */
export function rangeText(from: string, to: string): string {
  const withYear = from.slice(0, 4) !== to.slice(0, 4);
  return `${dayLabel(from, withYear)} to ${dayLabel(to, withYear)}`;
}

/** The row's date as people say it: "12 Oct" from the line's instant, in India time. */
export function lineDay(iso: string): string {
  const key = istDay(iso);
  return key == null ? '' : dayLabel(key);
}

const IST_OFFSET_MS = 330 * 60 * 1000;

/** 'YYYY-MM-DD' of an instant in India time, or null if unreadable. */
export function istDay(iso: string | number | Date | null | undefined): string | null {
  if (iso == null) return null;
  const ms = iso instanceof Date ? iso.getTime() : typeof iso === 'number' ? iso : Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms + IST_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

/** A preset ending today (India time) and starting `days` calendar days earlier. */
export function presetRange(days: number, now: Date = new Date()): { from: string; to: string } {
  const to = istDay(now) as string;
  const from = istDay(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000) as string;
  return { from, to };
}

/** True for a real 'YYYY-MM-DD' day. */
export function isDay(text: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1
    && d.getUTCDate() === Number(m[3]);
}

/** The words for a failed statement request: the range message for a 400, else null. */
export function statementErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 400) return RANGE_TOO_WIDE;
  return 'Could not load your statement.';
}

/** The wallet page for a repayment, built the way History builds it from an entry id. */
export function walletEntryRoute(walletEntryId: number): string {
  return `/restaurant/wallet/transaction/${walletEntryId}`;
}

/** The order page for a drawn order. */
export function orderRoute(supplierOrderId: number): string {
  return `/restaurant/orders/${supplierOrderId}`;
}
