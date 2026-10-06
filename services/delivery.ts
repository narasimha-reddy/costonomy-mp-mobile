import { apiRequest } from '@/lib/api/client';
import type {
  ArrivalStage,
  AvailableSlot,
  Delivery,
  DeliveryEvent,
  DeliverySlot,
  KitchenAction,
  OutletDeliveryRadarItem,
  OutletDeliveryRadarResponse,
  PagedResponse,
  ScheduleStatus,
} from '@/models/delivery';

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

export interface RequestDeliveryOptions {
  mode?: 'COSTONOMY' | 'SUPPLIER_OWN';
  requiredEtaMinutes?: number;
}

/**
 * Request/arrange a delivery partner for an order that is ready.
 * Quotes and books the partner (e.g. Pidge).
 */
export function requestDelivery(
  token: string,
  orderId: number,
  idempotencyKey: string,
  options?: RequestDeliveryOptions,
): Promise<Delivery> {
  return apiRequest<Delivery>(`/api/v1/supplier-orders/${orderId}/delivery`, {
    method: 'POST',
    token,
    idempotencyKey,
    body: options ?? {},
  });
}

export function fetchDeliveryEvents(token: string, deliveryId: number): Promise<DeliveryEvent[]> {
  return apiRequest<DeliveryEvent[]>(`/api/v1/deliveries/${deliveryId}/events`, { token });
}

export interface RadarFilterOptions {
  action?: KitchenAction;
  stage?: ArrivalStage;
  scheduleStatus?: ScheduleStatus;
}

/**
 * Situational delivery radar for an outlet.
 *
 * <p>Ranks active incoming deliveries by physical arrival urgency, categorised by
 * arrival stages, problem states, and recommended kitchen actions.
 */
export function fetchOutletDeliveryRadar(
  token: string,
  outletId: number,
  filters: RadarFilterOptions = {},
): Promise<OutletDeliveryRadarResponse> {
  const params = new URLSearchParams();
  if (filters.action) params.set('action', filters.action);
  if (filters.stage) params.set('stage', filters.stage);
  if (filters.scheduleStatus) params.set('scheduleStatus', filters.scheduleStatus);
  const qs = params.toString();
  return apiRequest<OutletDeliveryRadarResponse>(
    `/api/v1/outlets/${outletId}/deliveries/radar${qs ? `?${qs}` : ''}`,
    { token },
  );
}

/**
 * Paginated list of deliveries for an outlet (newest first).
 */
export function fetchOutletDeliveries(
  token: string,
  outletId: number,
  options: { page?: number; size?: number; status?: string } = {},
): Promise<PagedResponse<OutletDeliveryRadarItem>> {
  const params = new URLSearchParams();
  params.set('page', String(options.page ?? 0));
  params.set('size', String(options.size ?? 10));
  if (options.status) params.set('status', options.status);
  return apiRequest<PagedResponse<OutletDeliveryRadarItem>>(
    `/api/v1/outlets/${outletId}/deliveries?${params.toString()}`,
    { token },
  );
}

/**
 * Ask for another partner for a delivery that stopped without a driver (no partner available, a refusal, a driver who
 * cancelled). The API keeps the same delivery and re-quotes it.
 */
export function reassignDelivery(token: string, deliveryId: number, idempotencyKey: string): Promise<Delivery> {
  return apiRequest<Delivery>(`/api/v1/deliveries/${deliveryId}/reassign`, {
    method: 'POST',
    token,
    idempotencyKey,
    body: {},
  });
}

/**
 * Deliver an order yourself because no partner was found. The same delivery becomes the supplier's own; the charge
 * the buyer paid is unchanged (API D-151).
 */
export function switchToOwnDelivery(token: string, deliveryId: number, idempotencyKey: string): Promise<Delivery> {
  return apiRequest<Delivery>(`/api/v1/deliveries/${deliveryId}/switch-to-own`, {
    method: 'POST',
    token,
    idempotencyKey,
  });
}

/**
 * Report that the supplier has set off with their own delivery.
 * Refused for COSTONOMY delivery mode.
 */
export function markDeliveryDispatched(token: string, deliveryId: number): Promise<Delivery> {
  return apiRequest<Delivery>(`/api/v1/deliveries/${deliveryId}/dispatched`, {
    method: 'POST',
    token,
  });
}

/**
 * Report that the supplier has delivered their own delivery.
 * Refused for COSTONOMY delivery mode.
 */
export function markDeliveryDelivered(token: string, deliveryId: number): Promise<Delivery> {
  return apiRequest<Delivery>(`/api/v1/deliveries/${deliveryId}/delivered`, {
    method: 'POST',
    token,
  });
}

export function fetchDeliverySlots(token: string, storeId: number): Promise<DeliverySlot[]> {
  return apiRequest<DeliverySlot[]>(`/api/v1/supplier-stores/${storeId}/delivery-slots`, { token });
}

export function fetchAvailableSlots(token: string, storeId: number, date?: string): Promise<AvailableSlot[]> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : '';
  return apiRequest<AvailableSlot[]>(`/api/v1/supplier-stores/${storeId}/available-slots${qs}`, { token });
}

export function createDeliverySlot(
  token: string,
  storeId: number,
  payload: {
    slotName: string;
    startTime: string;
    endTime: string;
    orderCutoffTime: string;
    maxOrdersPerDay: number;
  },
): Promise<DeliverySlot> {
  return apiRequest<DeliverySlot>(`/api/v1/supplier-stores/${storeId}/delivery-slots`, {
    method: 'POST',
    token,
    body: payload,
  });
}

export function updateDeliverySlot(
  token: string,
  storeId: number,
  slotId: number,
  payload: {
    slotName: string;
    startTime: string;
    endTime: string;
    orderCutoffTime: string;
    maxOrdersPerDay: number;
    active?: boolean;
  },
): Promise<DeliverySlot> {
  return apiRequest<DeliverySlot>(`/api/v1/supplier-stores/${storeId}/delivery-slots/${slotId}`, {
    method: 'PUT',
    token,
    body: payload,
  });
}

export function deleteDeliverySlot(token: string, storeId: number, slotId: number): Promise<void> {
  return apiRequest<void>(`/api/v1/supplier-stores/${storeId}/delivery-slots/${slotId}`, {
    method: 'DELETE',
    token,
  });
}

