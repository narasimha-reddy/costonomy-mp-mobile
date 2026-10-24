import { ApiError } from '@/lib/api/errors';
import { owesAnything } from '@/lib/credit/overview';
import type { CreditAgreement } from '@/models/credit';

/**
 * What a restaurant's existing credit with a supplier means for asking again.
 *
 * <p>The server refuses to re-request a live, pending, paused or approved line
 * (and a closed one with money owed), so the list says so up front instead of
 * letting someone fill a form that cannot be sent.
 */
export type RequestBlock =
  | { kind: 'open'; label: string; link: boolean }
  | { kind: 'review'; label: string }
  | { kind: 'blocked'; label: string };

export interface SupplierCreditState {
  /** Null when a new request can be made. */
  block: RequestBlock | null;
  /** The agreement behind a block, for opening it. */
  agreementId: number | null;
  /** A second line of explanation, e.g. why a line is paused. */
  detail: string | null;
}

const FREE: SupplierCreditState = { block: null, agreementId: null, detail: null };

export function supplierCreditState(agreement: CreditAgreement | undefined): SupplierCreditState {
  if (agreement == null) return FREE;
  const id = agreement.id;
  switch (agreement.status) {
    case 'ACTIVE':
      return { block: { kind: 'open', label: 'You already have credit here', link: true }, agreementId: id, detail: null };
    case 'REQUESTED':
      return { block: { kind: 'blocked', label: 'Request waiting for supplier' }, agreementId: id, detail: null };
    case 'APPROVED':
      return { block: { kind: 'review', label: 'Terms ready: review and accept' }, agreementId: id, detail: null };
    case 'SUSPENDED':
      return {
        block: { kind: 'blocked', label: 'Paused' },
        agreementId: id,
        detail: agreement.suspensionReason ?? null,
      };
    case 'CLOSED':
    case 'EXPIRED':
      return owesAnything(agreement)
        ? {
          block: { kind: 'open', label: 'You still owe this supplier. Pay that first', link: true },
          agreementId: id,
          detail: null,
        }
        : FREE;
    default:
      return FREE; // REJECTED: free to ask again.
  }
}

/** The agreements by supplier store, from the summary already loaded. */
export function agreementsByStore(agreements: CreditAgreement[]): Map<number, CreditAgreement> {
  return new Map(agreements.map((a) => [a.supplierStoreId, a]));
}

const GENERIC = "We couldn't send that request. Please try again.";

/**
 * A refusal in words a restaurant owner can act on. Never a raw code.
 *
 * <p>The server's own sentence is kept when it reads like one; the known
 * refusals have their wording here so the screen does not depend on it.
 */
export function requestErrorMessage(caught: unknown): string {
  if (!(caught instanceof ApiError)) {
    return "We couldn't reach the server. Check your connection and try again.";
  }
  const text = caught.message ?? '';
  switch (caught.code) {
    case 'CREDIT_AGREEMENT_NOT_ACTIVE':
      return "This supplier doesn't offer credit yet.";
    case 'FORBIDDEN':
      return "You don't have permission to ask for credit. Ask the account owner to do it.";
    case 'NOT_FOUND':
      return "We couldn't find that supplier. Search for it again.";
    default:
  }
  if (caught.status === 429) return 'Too many tries. Wait a moment, then try again.';
  if (/already have credit/i.test(text)) return 'You already have credit with this supplier.';
  if (/already waiting/i.test(text)) return 'A request to this supplier is already waiting for a response.';
  if (/suspend|paused/i.test(text)) return 'Your credit with this supplier is paused. Open it to see why.';
  if (/owe|outstanding|overdue/i.test(text)) return 'You still owe this supplier. Pay what you owe first.';
  // Keep the server's sentence only if it is a sentence, not a code.
  return /\s/.test(text) && !/^[A-Z0-9_]+$/.test(text) ? text : GENERIC;
}
