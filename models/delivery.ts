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
  trackingUrl: string | null;
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
  /** While no partner is found: when the automatic retries stop (API D-151). */
  retryUntil?: string | null;
  /** The supplier may now deliver this order themselves (API D-151). */
  canSwitchToOwn?: boolean;
}

export type ArrivalStage =
  | 'AT_KITCHEN_DOOR'
  | 'APPROACHING'
  | 'EN_ROUTE'
  | 'AT_SUPPLIER_PICKUP'
  | 'DRIVER_DISPATCHED'
  | 'AWAITING_DRIVER'
  | 'DELIVERED_UNCHECKED';

export type ScheduleStatus =
  | 'ON_SCHEDULE'
  | 'RUNNING_LATE'
  | 'CRITICALLY_DELAYED';

export type ProblemType =
  | 'NONE'
  | 'STALE_TELEMETRY'
  | 'MISSED_ETA'
  | 'CARRIER_EXCEPTION'
  | 'UNASSIGNED_TIMEOUT';

export type KitchenAction =
  | 'CHECK_IN'
  | 'MEET_DRIVER'
  | 'PREPARE_DOCK'
  | 'CALL_DRIVER'
  | 'ESCALATE'
  | 'MONITOR';

export interface DriverInfo {
  name: string | null;
  phone: string | null;
  vehicle: string | null;
}

export interface SupplierInfo {
  supplierStoreId: number;
  supplierStoreName: string | null;
  supplierOrgName: string | null;
  contactPhone: string | null;
}

export interface ProblemDetails {
  hasProblem: boolean;
  problemType: ProblemType;
  problemDescription: string | null;
  failureCode: string | null;
  failureReason: string | null;
}

/**
 * An item in the outlet delivery situational radar.
 * Answers kitchen operational questions directly: arrival urgency, driver, problems, action.
 */
export interface OutletDeliveryRadarItem {
  deliveryId: number;
  supplierOrderId: number;
  orderNumber: string;
  outletId: number;
  status: DeliveryStatus;
  arrivalStage: ArrivalStage;
  arrivalRank: number;
  scheduleStatus: ScheduleStatus;
  minutesOverdue: number | null;
  etaMinutes: number | null;
  estimatedArrivalAt: string | null;
  supplier: SupplierInfo;
  driver: DriverInfo;
  problem: ProblemDetails;
  recommendedAction: KitchenAction;
  actionReason: string;
  isCheckedIn: boolean;
  location: DeliveryLocation | null;
  locationStale: boolean;
  locationAgeSeconds: number | null;
  requestedAt: string | null;
  assignedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
}

export interface RadarSummary {
  totalActive: number;
  atDoorCount: number;
  approachingCount: number;
  enRouteCount: number;
  delayedCount: number;
  pendingCheckInCount: number;
  requiresEscalationCount: number;
}

export interface OutletDeliveryRadarResponse {
  outletId: number;
  summary: RadarSummary;
  items: OutletDeliveryRadarItem[];
}

export interface PagedResponse<T> {
  items: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
}

export interface DeliverySlot {
  id: number;
  supplierStoreId: number;
  slotName: string;
  startTime: string;
  endTime: string;
  orderCutoffTime: string;
  maxOrdersPerDay: number;
  active: boolean;
}

export interface AvailableSlot {
  id: number;
  slotName: string;
  startTime: string;
  endTime: string;
  orderCutoffTime: string;
  maxOrdersPerDay: number;
  bookedOrders: number;
  availableCapacity: number;
  available: boolean;
  unavailableReason: string | null;
}

