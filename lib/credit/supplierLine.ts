import type { ApproveCreditInput, ModifyCreditInput } from '@/services/credit';
import type { CreditAgreement } from '@/models/credit';
import { toScaled } from '@/lib/wallet/amount';
import { formatDay } from '@/utils/dateRange';
import { formatMoney } from '@/utils/money';

/** The payment periods offered as one tap; anything from 1 to 180 days can be typed. */
export const PERIOD_CHIPS = [7, 15, 30, 45, 60] as const;

export const MIN_REASON = 3;
export const MAX_REASON = 500;

/** The badge on a payment, told by who made it. An unknown source gets none: nothing is claimed. */
export function paymentBadge(source: string | null | undefined): string | null {
  switch (source) {
    case 'SUPPLIER_RECORDED': return 'You recorded';
    case 'CLAIM_CONFIRMED': return 'Confirmed claim';
    case 'WALLET': return 'Through Mandi';
    default: return null;
  }
}

/** Whether a reason is long enough to send: 3 to 500 characters once trimmed (the server's limits). */
export function reasonCheck(text: string): boolean {
  const n = text.trim().length;
  return n >= MIN_REASON && n <= MAX_REASON;
}

/** What the terms form holds while it is being edited: text, as typed. */
export interface TermsDraft {
  limit: string;
  days: string;
  grace: string;
  /** Blank means no per-order cap. */
  cap: string;
  /** Blank means no auto-pause threshold. */
  maxOverdue: string;
  reason: string;
}

/** "50000.0000" as "50000", "1200.5000" as "1200.5": what a person would type. */
function plain(amount: string | number | null | undefined): string {
  if (amount == null || amount === '') return '';
  const text = String(amount);
  return text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text;
}

/** The form's starting values: the line as it is, or for a request what was asked for. */
export function draftFromAgreement(a: CreditAgreement): TermsDraft {
  const asked = a.status === 'REQUESTED' ? a.latestRequest : null;
  return {
    limit: asked != null ? plain(asked.requestedLimit) : plain(a.approvedLimit),
    days: String(asked != null ? asked.requestedPeriodDays : a.creditPeriodDays ?? 30),
    grace: String(a.gracePeriodDays ?? 0),
    cap: plain(a.maxSingleOrderCredit),
    maxOverdue: plain(a.maxOverdueAmount),
    reason: '',
  };
}

/** "Limit can go no lower than ₹38,000.00 ..." when the server sent a floor, else null. */
export function minLimitHint(minLimit: string | number | null | undefined): string | null {
  if (minLimit == null || minLimit === '') return null;
  return `Limit can go no lower than ${formatMoney(minLimit)} (already drawn or on hold).`;
}

export interface TermsErrors {
  limit?: string;
  days?: string;
  grace?: string;
  cap?: string;
  maxOverdue?: string;
  reason?: string;
}

const WHOLE = /^\d{1,3}$/;

/**
 * Checks the form before a tap. A hint, never the verdict: the server checks again and
 * its message is shown if it disagrees. Amounts are compared as scaled integers, and the
 * floor is only applied when the server sent one (`minLimit`); otherwise a cut below what
 * is already drawn is refused by the server with its own words.
 */
export function checkTerms(
  draft: TermsDraft,
  opts: { minLimit?: string | number | null; reasonRequired: boolean },
): { valid: boolean; errors: TermsErrors } {
  const errors: TermsErrors = {};

  const limit = toScaled(draft.limit.trim(), 2);
  if (limit == null || limit <= 0) {
    errors.limit = 'Enter a credit limit above zero, with at most 2 decimal places.';
  } else if (opts.minLimit != null && opts.minLimit !== '') {
    const floor = toScaled(opts.minLimit, 4);
    if (floor != null && limit < floor) errors.limit = minLimitHint(opts.minLimit) ?? undefined;
  }

  const days = WHOLE.test(draft.days.trim()) ? Number(draft.days) : null;
  if (days == null || days < 1 || days > 180) errors.days = 'Choose 1 to 180 days.';

  const grace = WHOLE.test(draft.grace.trim()) ? Number(draft.grace) : null;
  if (grace == null || grace > 60) errors.grace = 'Grace can be 0 to 60 days.';

  if (draft.cap.trim() !== '') {
    const cap = toScaled(draft.cap.trim(), 2);
    if (cap == null || cap < 10_000) errors.cap = 'A per-order cap is at least ₹1. Leave it empty for no cap.';
  }

  if (draft.maxOverdue.trim() !== '') {
    if (toScaled(draft.maxOverdue.trim(), 2) == null) {
      errors.maxOverdue = 'Enter an amount of zero or more, or leave it empty.';
    }
  }

  if (opts.reasonRequired && !reasonCheck(draft.reason)) {
    errors.reason = 'Add a reason of at least 3 characters. The restaurant sees it.';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * The body for `/modify`. The server overwrites the cap and the threshold with what it
 * is sent (a missing one clears it), so both are sent whenever the form has them.
 */
export function modifyInputFrom(draft: TermsDraft): ModifyCreditInput {
  return {
    approvedLimit: draft.limit.trim(),
    creditPeriodDays: Number(draft.days),
    gracePeriodDays: Number(draft.grace),
    ...(draft.cap.trim() !== '' ? { maxSingleOrderCredit: draft.cap.trim() } : {}),
    ...(draft.maxOverdue.trim() !== '' ? { maxOverdueAmount: draft.maxOverdue.trim() } : {}),
    reason: draft.reason.trim(),
  };
}

/** The body for `/approve` on the supplier's own terms (a modification the restaurant must accept). */
export function approveInputFrom(draft: TermsDraft): ApproveCreditInput {
  const note = draft.reason.trim();
  return {
    approvedLimit: draft.limit.trim(),
    creditPeriodDays: Number(draft.days),
    gracePeriodDays: Number(draft.grace),
    ...(draft.cap.trim() !== '' ? { maxSingleOrderCredit: draft.cap.trim() } : {}),
    ...(draft.maxOverdue.trim() !== '' ? { maxOverdueAmount: draft.maxOverdue.trim() } : {}),
    ...(note !== '' ? { note } : {}),
  };
}

export interface LineBanner {
  kind: 'SYSTEM_SUSPENDED' | 'SUPPLIER_SUSPENDED' | 'SUSPENDED' | 'OFFER_PENDING' | 'OFFER_EXPIRED';
  tone: 'warning' | 'info';
  title: string;
  body: string | null;
}

/**
 * The banner above a restaurant's hero, worded from what the server sent. A pause the
 * overdue sweep made says how much is overdue (and the threshold, when the server sends
 * it); a pause by a person shows their reason; an approved offer says it is waiting for
 * the restaurant. `sentAgo` is the server's timestamp already put in words.
 */
export function lineBanner(a: CreditAgreement, sentAgo: string | null): LineBanner | null {
  if (a.status === 'SUSPENDED') {
    const reason = a.suspensionReason != null && a.suspensionReason !== '' ? a.suspensionReason : null;
    if (a.suspensionSource === 'SYSTEM') {
      const above = a.maxOverdueAmount != null && a.maxOverdueAmount !== ''
        ? ` is above your ${formatMoney(a.maxOverdueAmount)} limit` : '';
      return {
        kind: 'SYSTEM_SUSPENDED',
        tone: 'warning',
        title: 'This line is paused',
        body: `Auto-paused: ${formatMoney(a.overdue)} overdue${above}. It reopens when they pay, or you can reinstate.`,
      };
    }
    if (a.suspensionSource === 'SUPPLIER') {
      return {
        kind: 'SUPPLIER_SUSPENDED',
        tone: 'warning',
        title: 'You suspended this line',
        body: `${reason ?? 'No new orders can draw on it.'} Existing debt and reservations are untouched.`,
      };
    }
    return {
      kind: 'SUSPENDED',
      tone: 'warning',
      title: 'This line is suspended',
      body: `${reason ?? 'No new orders can draw on it.'} Existing debt and reservations are untouched.`,
    };
  }
  if (a.status === 'APPROVED') {
    const until = formatDay(a.offerExpiresOn);
    return {
      kind: 'OFFER_PENDING',
      tone: 'info',
      title: `Offer v${a.termsVersion ?? 1} sent${sentAgo != null ? ` ${sentAgo}` : ''}; not accepted yet`,
      body: `${until != null ? `Offer valid until ${until}. ` : ''}Nothing can be drawn until the restaurant accepts these terms.`,
    };
  }
  if (a.status === 'EXPIRED') {
    return {
      kind: 'OFFER_EXPIRED',
      tone: 'info',
      title: 'Offer expired',
      body: 'They did not accept in time. They can ask for credit again.',
    };
  }
  return null;
}

const PAUSE_AGAIN = 'If more of what they owe goes overdue, the line may pause again on its own.';

/**
 * Plain words for the reinstate sheet: lifting an automatic pause while they are still
 * overdue can be undone by the sweep when more becomes overdue. Nothing for a pause by a
 * person. The server does the sum; this only says when the warning applies.
 */
export function reinstateNote(a: CreditAgreement): string | null {
  if (a.suspensionSource === 'SYSTEM') return PAUSE_AGAIN;
  if (a.suspensionSource == null && Number(a.overdue) > 0) return PAUSE_AGAIN;
  return null;
}
