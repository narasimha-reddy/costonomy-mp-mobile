import { apiRequest } from '@/lib/api/client';
import type {
  Dispute, DisputeCategory, DisputeRefund, DisputeRefundLimit, Rating, Receiving,
} from '@/models/trust';

// ── Receiving ─────────────────────────────────────────────────────────

export interface ReceiveItemInput {
  supplierOrderItemId: number;
  receivedQuantity: string;
  damagedQuantity: string;
  missingQuantity: string;
  note?: string;
}

/**
 * Check the order in.
 *
 * <p><b>All three quantities travel for every line.</b> The server requires them
 * to add up to what was accepted, and defaulting the ones the user did not touch
 * would let a tap-through record a delivery nobody counted — the blind "Complete"
 * button §23A.22 forbids.
 */
export function receiveOrder(
  token: string,
  orderId: number,
  items: ReceiveItemInput[],
  notes: string | undefined,
  idempotencyKey: string,
): Promise<Receiving> {
  return apiRequest<Receiving>(`/api/v1/supplier-orders/${orderId}/receive`, {
    method: 'POST',
    token,
    idempotencyKey,
    body: { items, notes },
  });
}

export function fetchReceiving(token: string, orderId: number): Promise<Receiving> {
  return apiRequest<Receiving>(`/api/v1/supplier-orders/${orderId}/receiving`, { token });
}

// ── Disputes ──────────────────────────────────────────────────────────

export interface CreateDisputeInput {
  category: DisputeCategory;
  description: string;
  claimedAmount?: string;
  items?: { supplierOrderItemId: number; disputedQuantity: string; reason?: string }[];
  evidence?: { evidenceType: string; reference: string; caption?: string }[];
}

export function createDispute(
  token: string,
  orderId: number,
  input: CreateDisputeInput,
  idempotencyKey: string,
): Promise<Dispute> {
  return apiRequest<Dispute>(`/api/v1/supplier-orders/${orderId}/disputes`, {
    method: 'POST',
    token,
    idempotencyKey,
    body: input,
  });
}

export function fetchDisputes(token: string, orderId: number): Promise<Dispute[]> {
  return apiRequest<Dispute[]>(`/api/v1/supplier-orders/${orderId}/disputes`, { token });
}

export function fetchDispute(token: string, disputeId: number): Promise<Dispute> {
  return apiRequest<Dispute>(`/api/v1/disputes/${disputeId}`, { token });
}

export function postDisputeMessage(
  token: string,
  disputeId: number,
  message: string,
): Promise<Dispute> {
  return apiRequest<Dispute>(`/api/v1/disputes/${disputeId}/messages`, {
    method: 'POST',
    token,
    body: { message },
  });
}

/** An outlet's disputes, newest first: the restaurant's Disputes section. */
export function fetchOutletDisputes(token: string, outletId: number): Promise<Dispute[]> {
  return apiRequest<Dispute[]>(`/api/v1/outlets/${outletId}/disputes`, { token });
}

/** A store's disputes, newest first: the supplier's Disputes section. */
export function fetchStoreDisputes(token: string, storeId: number): Promise<Dispute[]> {
  return apiRequest<Dispute[]>(`/api/v1/supplier-stores/${storeId}/disputes`, { token });
}

// ── Refunds on a dispute (API D-104) ──────────────────────────────────

/**
 * How much could be asked for, or why nothing can — before asking, so the form
 * says so rather than the server refusing after. The server's figure: the lower
 * of the order's money and the supplier's payout for it.
 */
export function fetchRefundLimit(token: string, disputeId: number): Promise<DisputeRefundLimit> {
  return apiRequest<DisputeRefundLimit>(`/api/v1/disputes/${disputeId}/refund-limit`, { token });
}

export function requestDisputeRefund(
  token: string,
  disputeId: number,
  amount: string,
  reason: string | undefined,
  idempotencyKey: string,
): Promise<DisputeRefund> {
  return apiRequest<DisputeRefund>(`/api/v1/disputes/${disputeId}/refund-request`, {
    method: 'POST',
    token,
    idempotencyKey,
    body: { amount, reason },
  });
}

/** The supplier agrees: the restaurant's wallet is credited and the payout charged. */
export function approveDisputeRefund(
  token: string,
  requestId: number,
  note: string | undefined,
  idempotencyKey: string,
): Promise<DisputeRefund> {
  return apiRequest<DisputeRefund>(`/api/v1/dispute-refunds/${requestId}/approve`, {
    method: 'POST',
    token,
    idempotencyKey,
    body: { note },
  });
}

/** The supplier says no, with a reason. Mandi's operations team then decides. */
export function declineDisputeRefund(
  token: string,
  requestId: number,
  note: string,
  idempotencyKey: string,
): Promise<DisputeRefund> {
  return apiRequest<DisputeRefund>(`/api/v1/dispute-refunds/${requestId}/decline`, {
    method: 'POST',
    token,
    idempotencyKey,
    body: { note },
  });
}

// ── Ratings ───────────────────────────────────────────────────────────

export interface CreateRatingInput {
  overall: number;
  productQuality?: number;
  quantityAccuracy?: number;
  packaging?: number;
  delivery?: number;
  comment?: string;
}

/**
 * Rate a completed order.
 *
 * <p>One rating per order, enforced server-side. The idempotency key is what
 * stops a double-tap becoming a duplicate submission (doc 05 §18); a second
 * genuine attempt is refused by the server with a message saying so.
 */
export function createRating(
  token: string,
  orderId: number,
  input: CreateRatingInput,
  idempotencyKey: string,
): Promise<Rating> {
  return apiRequest<Rating>(`/api/v1/supplier-orders/${orderId}/rating`, {
    method: 'POST',
    token,
    idempotencyKey,
    body: input,
  });
}

export function fetchRating(token: string, orderId: number): Promise<Rating> {
  return apiRequest<Rating>(`/api/v1/supplier-orders/${orderId}/rating`, { token });
}
