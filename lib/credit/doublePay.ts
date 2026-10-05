import { formatMoney, type Money } from '@/utils/money';

type Amount = Money | number | string | null | undefined;

const num = (v: Amount): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Whether paying `paying` from the wallet overlaps reports the restaurant already made
 * ("I paid", waiting for the supplier).
 *
 * <p>Comparison only, no arithmetic: there are waiting reports, and the amount being paid
 * is more than what can still be reported (owed minus waiting reports), so part of it is
 * the same money twice. Without the server's `reportable` figure there is no warning.
 */
export function overlapsWaitingReports(waiting: Amount, reportable: Amount, paying: Amount): boolean {
  const w = num(waiting);
  const r = num(reportable);
  const p = num(paying);
  return w != null && w > 0 && r != null && p != null && p > r;
}

export const PAY_ANYWAY_LABEL = (amount: string) => `Pay anyway ${formatMoney(amount)} from wallet`;

/** The warning shown above the Pay button. `waiting` is display only. */
export function doublePayWarning(waiting: Amount): string {
  return `You reported ${formatMoney(num(waiting) ?? 0)} paid outside the app and your supplier hasn't confirmed it yet. If you also pay from your wallet, you may pay twice.`;
}
