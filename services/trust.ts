import { apiRequest } from '@/lib/api/client';
import type { Dispute, DisputeCategory, Rating, Receiving } from '@/models/trust';

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
