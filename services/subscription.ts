import { apiRequest } from '@/lib/api/client';
import type {
  Subscription,
  SubscriptionFrequency,
  SubscriptionManifest,
} from '@/models/subscription';

export interface CreateSubscriptionPayload {
  supplierStoreId: number;
  supplierSkuId: number;
  quantity: number | string;
  unit: string;
  frequency: SubscriptionFrequency;
  preferredSlotId?: number;
  deliveryMode?: 'SUPPLIER_DELIVERY' | 'PICKUP';
  /** WALLET, or CREDIT with an active agreement with this supplier; the server refuses anything else (API D-132). */
  paymentMethod: 'WALLET' | 'CREDIT';
  startDate: string;
  endDate?: string;
  notes?: string;
}

export function createSubscription(
  token: string,
  outletId: number,
  payload: CreateSubscriptionPayload,
): Promise<Subscription> {
  return apiRequest<Subscription>(`/api/v1/outlets/${outletId}/subscriptions`, {
    method: 'POST',
    token,
    body: payload,
  });
}

export function fetchOutletSubscriptions(token: string, outletId: number): Promise<Subscription[]> {
  return apiRequest<Subscription[]>(`/api/v1/outlets/${outletId}/subscriptions`, { token });
}

export function fetchSubscription(token: string, id: number): Promise<Subscription> {
  return apiRequest<Subscription>(`/api/v1/subscriptions/${id}`, { token });
}

export function pauseSubscription(token: string, id: number): Promise<Subscription> {
  return apiRequest<Subscription>(`/api/v1/subscriptions/${id}/pause`, {
    method: 'PATCH',
    token,
  });
}

export function resumeSubscription(token: string, id: number): Promise<Subscription> {
  return apiRequest<Subscription>(`/api/v1/subscriptions/${id}/resume`, {
    method: 'PATCH',
    token,
  });
}

export function cancelSubscription(token: string, id: number, reason?: string): Promise<Subscription> {
  const qs = reason ? `?reason=${encodeURIComponent(reason)}` : '';
  return apiRequest<Subscription>(`/api/v1/subscriptions/${id}${qs}`, {
    method: 'DELETE',
    token,
  });
}

export function addSubscriptionSkipDate(
  token: string,
  id: number,
  skipDate: string,
  reason?: string,
): Promise<Subscription> {
  return apiRequest<Subscription>(`/api/v1/subscriptions/${id}/skip-dates`, {
    method: 'POST',
    token,
    body: { skipDate, reason },
  });
}

export function removeSubscriptionSkipDate(
  token: string,
  id: number,
  skipDate: string,
): Promise<Subscription> {
  return apiRequest<Subscription>(`/api/v1/subscriptions/${id}/skip-dates/${skipDate}`, {
    method: 'DELETE',
    token,
  });
}

export function fetchStoreSubscriptions(token: string, storeId: number): Promise<Subscription[]> {
  return apiRequest<Subscription[]>(`/api/v1/supplier-stores/${storeId}/subscriptions`, { token });
}

export function fetchStoreSubscriptionManifest(
  token: string,
  storeId: number,
  date?: string,
): Promise<SubscriptionManifest> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : '';
  return apiRequest<SubscriptionManifest>(`/api/v1/supplier-stores/${storeId}/subscriptions/manifest${qs}`, { token });
}
