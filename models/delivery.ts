import type { Money } from '@/utils/money';

/**
 * Delivery, as the restaurant sees it. Mirrors `DeliveryResponse` field for
 * field (D-061).
 *
 * <p><b>There is deliberately no provider identity here, and there must never
 * be.</b> Doc 06 §4 and §10: the fee is one number and who is carrying it is
 * Mandi's business — a `providerCode` on this shape would leak the supply chain
 * to everyone who places an order.
 */
export type DeliveryStatus =
  | 'DELIVERY_REQUESTED' | 'QUOTE_RECEIVED' | 'PROVIDER_SELECTED' | 'DRIVER_ASSIGNED'
  | 'DRIVER_AT_PICKUP' | 'PICKED_UP' | 'IN_TRANSIT' | 'ARRIVED_AT_DESTINATION'
  | 'DELIVERED' | 'QUOTE_FAILED' | 'PROVIDER_UNAVAILABLE' | 'DRIVER_CANCELLED'
  | 'PICKUP_FAILED' | 'DELIVERY_FAILED' | 'CANCELLED';

export type DeliveryMode = 'SUPPLIER_OWN' | 'COSTONOMY';

export interface DeliveryLocation {
  latitude: Money;
  longitude: Money;
  bearing: Money | null;
  /** The provider's timestamp for the fix, not when we stored it. */
  recordedAt: string;
}

export interface DeliveryEvent {
  id: number;
  eventType: string;
  status: DeliveryStatus;
  description: string | null;
  occurredAt: string;
}

export interface Delivery {
  id: number;
  supplierOrderId: number;
  orderNumber: string;
  mode: DeliveryMode;
  status: DeliveryStatus;
  fee: Money;
  currency: string;
  pickupAddress: string | null;
  dropAddress: string | null;
  /** Null until a driver exists. Never a placeholder. */
  driverName: string | null;
  driverPhone: string | null;
  driverVehicle: string | null;
  etaMinutes: number | null;
  estimatedArrivalAt: string | null;
  /** False for supplier own delivery, which has no tracking by design (doc 06 §2). */
  trackable: boolean;
  location: DeliveryLocation | null;
  /** True when the newest fix is older than the freshness threshold (doc 06 §8). */
  locationStale: boolean;
  locationAgeSeconds: number | null;
  failureCode: string | null;
  failureReason: string | null;
  requestedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  timeline: DeliveryEvent[];
}
