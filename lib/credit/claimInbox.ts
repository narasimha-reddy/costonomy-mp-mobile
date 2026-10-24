import type { ClaimResponse } from '@/models/credit';
import { scaledToAmount, toScaled } from '@/lib/wallet/amount';

/** The quick reasons for saying a payment did not arrive. */
export const REJECT_REASONS = ['Not received', 'Amount differs', 'Wrong supplier', 'Other'] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

const MIN_REASON = 3;
const MAX_REASON = 500;

export interface ClaimGroup {
  name: string;
  claims: ClaimResponse[];
}

/** Claims under the restaurant that sent them, in the order the server sent them. Display only. */
export function groupClaimsByRestaurant(claims: readonly ClaimResponse[]): ClaimGroup[] {
  const groups = new Map<string, ClaimGroup>();
  for (const claim of claims) {
    const name = claim.restaurantName ?? claim.outletName ?? 'A restaurant';
    const held = groups.get(name);
    if (held != null) held.claims.push(claim);
    else groups.set(name, { name, claims: [claim] });
  }
  return [...groups.values()];
}

export interface ConfirmCheck {
  valid: boolean;
  /**
   * The amount to send, "3000.00", only when it is lower than the claim. Null
   * means "confirm what was claimed": the server then caps it at what is
   * outstanding now, which this screen cannot know better than it does.
   */
  amount: string | null;
  error: string | null;
}

/**
 * Checks the amount typed in the review sheet. A hint before a tap, never the
 * verdict: the server enforces the cap (claimed and outstanding) and its
 * message is shown if it disagrees. The supplier can confirm less than was
 * claimed, never more. Compared as integers, not floats.
 */
export function checkConfirmAmount(text: string, claimed: string | number): ConfirmCheck {
  const typed = text.trim() === '' ? null : toScaled(text.trim(), 2);
  const claim = toScaled(claimed, 4);
  if (typed == null) return { valid: false, amount: null, error: 'Enter an amount with at most 2 decimal places.' };
  if (typed <= 0) return { valid: false, amount: null, error: 'Enter an amount more than zero.' };
  if (claim != null && typed > claim) {
    return { valid: false, amount: null, error: 'That is more than the restaurant says it paid. You can confirm the same or less.' };
  }
  if (claim != null && typed === claim) return { valid: true, amount: null, error: null };
  return { valid: true, amount: scaledToAmount(typed), error: null };
}

/**
 * The reason to send, or null while there is not enough of one. A quick reason
 * stands alone (free text is added after it); "Other" needs words of its own.
 */
export function rejectReasonText(choice: RejectReason | null, freeText: string): string | null {
  if (choice == null) return null;
  const extra = freeText.trim();
  const text = choice === 'Other' ? extra : extra === '' ? choice : `${choice}: ${extra}`;
  return text.length >= MIN_REASON && text.length <= MAX_REASON ? text : null;
}

/**
 * Whether this person may confirm or reject. CREDIT_COLLECT is the narrow
 * permission for answering payments; CREDIT_MODIFY has always been enough.
 * Hiding is a courtesy: the server checks again.
 */
export function mayDecideClaims(
  canForStore: (permission: string, store: { id: number; supplierOrganizationId: number }) => boolean,
  store: { id: number; supplierOrganizationId: number } | null | undefined,
): boolean {
  return store != null
    && (canForStore('CREDIT_COLLECT', store) || canForStore('CREDIT_MODIFY', store));
}

/** The group heading for claims the server flags `stale` (waiting 7 days or more). */
export const STALE_GROUP_TITLE = 'Waiting 7+ days';

/**
 * Splits the inbox on the SERVER's `stale` flag, never on a count of days the app works out.
 * Each part keeps the order the server sent.
 */
export function splitStale(claims: readonly ClaimResponse[]): { stale: ClaimResponse[]; rest: ClaimResponse[] } {
  return {
    stale: claims.filter((c) => c.stale === true),
    rest: claims.filter((c) => c.stale !== true),
  };
}

/** "Waiting 3 days", from the server's own count; null on an older API that sends none. */
export function waitingText(claim: Pick<ClaimResponse, 'ageDays'>): string | null {
  const n = claim.ageDays;
  if (typeof n !== 'number') return null;
  if (n <= 0) return 'Waiting since today';
  return n === 1 ? 'Waiting 1 day' : `Waiting ${n} days`;
}

/** The warning when the server finds the same amount and reference already on record; null otherwise. */
export function duplicateWarning(claim: Pick<ClaimResponse, 'possibleDuplicateOf' | 'possibleDuplicateKind'>): string | null {
  if (claim.possibleDuplicateOf == null) return null;
  return claim.possibleDuplicateKind === 'CLAIM'
    ? 'Looks like another report you already have (same amount and reference)'
    : 'Looks like a payment you already have (same amount and reference)';
}
