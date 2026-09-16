import type { StatusTone } from '@/components/common/MandiStatusChip';
import type {
  ProcurementStatus as ProcurementStatusCode,
  RequirementStatus as RequirementStatusCode,
  SupplierOrderStatus as SupplierOrderStatusCode,
} from './procurement';

/**
 * Domain status → display.
 *
 * The state machines these mirror are defined in `docs/specs/03-state-machines-permissions.md`
 * and owned by the backend. This file maps a server status string to a label and
 * a tone; **it does not decide transitions**. A screen must never infer that an
 * order is now CONFIRMED because the user tapped Accept — it renders whatever
 * status the API returned (guardrail 4, "never trust client state transitions").
 *
 * `unknownStatus()` handles a status this build has not heard of. A new backend
 * state must degrade to a readable neutral chip rather than an empty one, because
 * mobile releases lag the API.
 */

export interface StatusDisplay {
  label: string;
  tone: StatusTone;
}

/**
 * Why the maps below are written as `satisfies Record<Code, StatusDisplay>` and
 * only then widened to `Record<string, StatusDisplay>`.
 *
 * <p>The widening is deliberate and has to stay: `resolveStatus` must survive a
 * status this build has never heard of, because mobile releases lag the API. But
 * a bare `Record<string, StatusDisplay>` on the literal meant the keys were never
 * checked against anything, and the app shipped for weeks believing an accepted
 * order was `ACCEPTED` when the server has only ever said `CONFIRMED`. Every
 * comparison against it type-checked — `'ACCEPTED'` was a member of the union it
 * was compared to — and every one was false. The supplier's "Start preparing"
 * button lived behind one of them.
 *
 * <p>`satisfies` closes both halves: a status in the union with no entry here is
 * an error, and an entry here that is not a real status is an error too. The
 * union is the server's spelling, so this file can no longer drift from it in
 * silence.
 */
const widen = <T extends Record<string, StatusDisplay>>(map: T): Record<string, StatusDisplay> => map;

/** Supplier order — doc 03 §5. */
export const SupplierOrderStatus = widen({
  // DRAFT means the payment never completed, so the order never reached its
  // supplier (guardrail 16, D-020). "Draft" describes the row; it tells the
  // restaurant nothing about why nobody is acting on their order.
  DRAFT: { label: 'Payment incomplete', tone: 'warning' },
  PENDING_ACCEPTANCE: { label: 'Awaiting supplier', tone: 'pending' },
  CONFIRMED: { label: 'Confirmed', tone: 'success' },
  PARTIALLY_ACCEPTED: { label: 'Partially accepted', tone: 'warning' },
  PREPARING: { label: 'Preparing', tone: 'info' },
  READY_FOR_PICKUP: { label: 'Ready for pickup', tone: 'info' },
  OUT_FOR_DELIVERY: { label: 'Out for delivery', tone: 'live' },
  DELIVERED: { label: 'Delivered', tone: 'success' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  // Expired and rejected are distinct business outcomes (doc 01 §12, rule 11)
  // and must never be collapsed into one chip.
  EXPIRED: { label: 'No response', tone: 'danger' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
} satisfies Record<SupplierOrderStatusCode, StatusDisplay>);

/** Procurement — doc 03 §4. */
export const ProcurementStatus = widen({
  DRAFT: { label: 'Draft', tone: 'neutral' },
  VALIDATING: { label: 'Checking availability', tone: 'pending' },
  READY: { label: 'Ready to submit', tone: 'info' },
  PENDING_APPROVAL: { label: 'Awaiting approval', tone: 'pending' },
  APPROVED: { label: 'Approved', tone: 'success' },
  SUBMITTED: { label: 'Submitted', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  FAILED: { label: 'Submission failed', tone: 'danger' },
} satisfies Record<ProcurementStatusCode, StatusDisplay>);

/** Requirement — doc 03 §3. */
export const RequirementStatus = widen({
  OPEN: { label: 'Open', tone: 'info' },
  SOURCING: { label: 'Sourcing', tone: 'pending' },
  PARTIALLY_FULFILLED: { label: 'Partially fulfilled', tone: 'warning' },
  FULFILLED: { label: 'Fulfilled', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  EXPIRED: { label: 'Expired', tone: 'neutral' },
} satisfies Record<RequirementStatusCode, StatusDisplay>);

/** Payment — doc 03 §6. */
export const PaymentStatus: Record<string, StatusDisplay> = {
  CREATED: { label: 'Not paid', tone: 'neutral' },
  AUTHORIZED: { label: 'Authorised', tone: 'info' },
  CAPTURE_PENDING: { label: 'Confirming payment', tone: 'pending' },
  CAPTURED: { label: 'Paid', tone: 'success' },
  RELEASED: { label: 'Released', tone: 'neutral' },
  FAILED: { label: 'Payment failed', tone: 'danger' },
  PARTIALLY_REFUNDED: { label: 'Partially refunded', tone: 'info' },
  FULLY_REFUNDED: { label: 'Refunded', tone: 'info' },
};

/** Credit agreement — doc 03 §8. */
export const CreditAgreementStatus: Record<string, StatusDisplay> = {
  REQUESTED: { label: 'Requested', tone: 'pending' },
  APPROVED: { label: 'Approved', tone: 'success' },
  ACTIVE: { label: 'Active', tone: 'credit' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  SUSPENDED: { label: 'Suspended', tone: 'danger' },
  EXPIRED: { label: 'Expired', tone: 'neutral' },
  CLOSED: { label: 'Closed', tone: 'neutral' },
};

/**
 * Delivery — doc 03 §10.
 *
 * Note `DELIVERY_REQUESTED` and `QUOTE_RECEIVED` both read as "Finding a delivery
 * partner". Provider selection and bidding are internal and must never surface
 * to the restaurant (guardrail 8, doc 06 §4).
 */
export const DeliveryStatus: Record<string, StatusDisplay> = {
  DELIVERY_REQUESTED: { label: 'Finding a delivery partner', tone: 'pending' },
  QUOTE_RECEIVED: { label: 'Finding a delivery partner', tone: 'pending' },
  PROVIDER_SELECTED: { label: 'Assigning a partner', tone: 'pending' },
  DRIVER_ASSIGNED: { label: 'Partner assigned', tone: 'live' },
  DRIVER_AT_PICKUP: { label: 'At the supplier', tone: 'live' },
  PICKED_UP: { label: 'Picked up', tone: 'live' },
  IN_TRANSIT: { label: 'On the way', tone: 'live' },
  ARRIVED_AT_DESTINATION: { label: 'Arriving now', tone: 'live' },
  DELIVERED: { label: 'Delivered', tone: 'success' },
  QUOTE_FAILED: { label: 'No partner available', tone: 'danger' },
  PROVIDER_UNAVAILABLE: { label: 'No partner available', tone: 'danger' },
  DRIVER_CANCELLED: { label: 'Reassigning partner', tone: 'warning' },
  PICKUP_FAILED: { label: 'Pickup failed', tone: 'danger' },
  DELIVERY_FAILED: { label: 'Delivery failed', tone: 'danger' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};

/** Dispute — doc 03 §12. */
export const DisputeStatus: Record<string, StatusDisplay> = {
  OPEN: { label: 'Open', tone: 'warning' },
  UNDER_REVIEW: { label: 'Under review', tone: 'pending' },
  RESPONDED: { label: 'Supplier responded', tone: 'info' },
  RESOLVED: { label: 'Resolved', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
};

/** Availability — doc 01 §7. */
export const AvailabilityStatus: Record<string, StatusDisplay> = {
  AVAILABLE: { label: 'In stock', tone: 'success' },
  OUT_OF_STOCK: { label: 'Out of stock', tone: 'neutral' },
};

/**
 * Turn an unrecognised server status into something readable.
 * `READY_FOR_PICKUP` → `Ready for pickup`.
 */
export function unknownStatus(status: string): StatusDisplay {
  const label = status
    .toLowerCase()
    .split('_')
    .join(' ')
    .replace(/^./, (c) => c.toUpperCase());
  return { label, tone: 'neutral' };
}

/** Look a status up in a registry, falling back to a readable neutral chip. */
export function resolveStatus(
  registry: Record<string, StatusDisplay>,
  status: string | null | undefined,
): StatusDisplay {
  if (!status) return { label: 'Unknown', tone: 'neutral' };
  return registry[status] ?? unknownStatus(status);
}
