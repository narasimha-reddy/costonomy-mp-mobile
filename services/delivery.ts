import { apiRequest } from '@/lib/api/client';
import type { Delivery, DeliveryEvent } from '@/models/delivery';

/**
 * The delivery for an order.
 *
 * <p>Returns 404 until one exists — a delivery is created when the supplier marks
 * the order ready, so "no delivery yet" is a normal state and not an error. The
 * tracking screen treats it as "finding a partner" (doc 05 §16).
 */
export function fetchDelivery(token: string, orderId: number): Promise<Delivery> {
  return apiRequest<Delivery>(`/api/v1/supplier-orders/${orderId}/delivery`, { token });
}

export function fetchDeliveryEvents(token: string, deliveryId: number): Promise<DeliveryEvent[]> {
  return apiRequest<DeliveryEvent[]>(`/api/v1/deliveries/${deliveryId}/events`, { token });
}
