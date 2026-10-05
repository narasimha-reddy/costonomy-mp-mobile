import type { ClaimMethod } from '@/models/credit';
import { formatMoney, type Money } from '@/utils/money';
import { scaledToAmount, toScaled } from '@/lib/wallet/amount';
import { methodLabel } from '@/lib/credit/payments';

/** The ways a restaurant can have paid a supplier outside the app, in the order shown. */
export const CLAIM_METHODS: readonly ClaimMethod[] = ['BANK_TRANSFER', 'UPI', 'CASH', 'CHEQUE', 'CARD'];

export function claimMethodLabel(method: ClaimMethod | string): string {
  return methodLabel(method) ?? String(method);
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The calendar day in India (IST) for an instant, 'YYYY-MM-DD'. */
export function istDay(when: Date = new Date()): string {
  return new Date(when.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** An invoice's issue date as an India day: a plain day is kept, an instant is converted. */
export function issuedDay(issuedAt: string | null | undefined): string | null {
  if (issuedAt == null || issuedAt === '') return null;
  if (DAY_RE.test(issuedAt)) return issuedAt;
  const when = new Date(issuedAt);
  return Number.isNaN(when.getTime()) ? null : istDay(when);
}

/** A day moved by whole days. Calendar stepping, not money. */
export function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y as number, (m as number) - 1, (d as number) + delta)).toISOString().slice(0, 10);
}

export interface ClaimDraft {
  amountText: string;
  method: ClaimMethod;
  reference: string;
  paidOn: string;
  note: string;
}

export interface ClaimFieldErrors {
  amount?: string;
  reference?: string;
  paidOn?: string;
}

export interface ClaimCheck {
  valid: boolean;
  /** The amount to send, "500.00", when readable and at least 1. */
  amount: string | null;
  errors: ClaimFieldErrors;
}

const MIN_SCALED = 10_000; // ₹1.00

export function referenceRequired(method: ClaimMethod): boolean {
  return method !== 'CASH';
}

/**
 * Checks what was typed. A hint before a tap, never the verdict: the server
 * validates again and its message is shown if it disagrees. Nothing is added
 * up here; the amount sent is the text typed, normalised to two decimals.
 *
 * @param today the India day now
 * @param issuedOn the invoice's issue day in India, when known
 */
export function checkClaim(draft: ClaimDraft, today: string, issuedOn: string | null): ClaimCheck {
  const errors: ClaimFieldErrors = {};
  let amount: string | null = null;

  const text = draft.amountText.trim();
  if (text !== '') {
    const scaled = toScaled(text, 2);
    if (scaled == null) errors.amount = 'Use at most 2 decimal places.';
    else if (scaled < MIN_SCALED) errors.amount = 'Enter at least ₹1.00.';
    else amount = scaledToAmount(scaled);
  }

  const referenceMissing = referenceRequired(draft.method) && draft.reference.trim() === '';
  if (draft.paidOn > today) errors.paidOn = 'Pick today or an earlier day.';
  else if (issuedOn != null && draft.paidOn < issuedOn) errors.paidOn = 'That is before the invoice was issued.';

  const valid = amount != null && !referenceMissing && errors.paidOn == null && errors.amount == null;
  return { valid, amount, errors };
}

/** The line shown on a supplier's dues when reports are waiting for them; null when none are. */
export function reportedLine(openClaimsAmount: Money | number | null | undefined): string | null {
  return Number(openClaimsAmount) > 0
    ? `Told supplier: ${formatMoney(openClaimsAmount as Money)} · waiting for them to confirm`
    : null;
}

/**
 * Whether "I paid outside the app" is worth offering: unless the server says
 * nothing more can be reported. An absent figure (older API) keeps it shown.
 */
export function canReportPayment(reportable: number | string | null | undefined): boolean {
  if (reportable == null) return true;
  const n = Number(reportable);
  return !Number.isFinite(n) || n > 0;
}

/** Sum of the amounts of the reports still waiting for the supplier. Display only. */
export function waitingClaimsTotal(
  claims: readonly { status: string; amount: number | string }[] | null | undefined,
): number {
  return (claims ?? [])
    .filter((c) => c.status === 'SUBMITTED')
    .reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
}
