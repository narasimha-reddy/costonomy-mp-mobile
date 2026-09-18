import { apiRequest, newIdempotencyKey } from '@/lib/api/client';
import type { SupplierOrder } from '@/models/procurement';

/**
 * Orders — reading them, from either side.
 *
 * <p>The cart and requirement calls that used to live here are gone with the
 * flow itself (D-088). A basket is now a request and lives in
 * `services/intent.ts`; what a kitchen still needs is visible on the request
 * that asked for it, so there is nothing left for a requirement to hold.
 *
 * <p>An order is still an order, and both flows produce them, which is why this
 * file survives at all.
 */

export { newIdempotencyKey };

// ── Orders ────────────────────────────────────────────────────────────

export function fetchOutletOrders(token: string, outletId: number): Promise<SupplierOrder[]> {
  return apiRequest<SupplierOrder[]>(`/api/v1/outlets/${outletId}/supplier-orders`, { token });
}

export function fetchSupplierOrder(token: string, orderId: number): Promise<SupplierOrder> {
  return apiRequest<SupplierOrder>(`/api/v1/supplier-orders/${orderId}`, { token });
}
