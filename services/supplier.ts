import { apiRequest } from '@/lib/api/client';
import type { SupplierOrder } from '@/models/procurement';
import type { Money } from '@/utils/money';

export interface SupplierStore {
  id: number;
  supplierOrganizationId: number;
  name: string;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  latitude: Money | null;
  longitude: Money | null;
  contactName: string | null;
  contactPhone: string | null;
  responseSlaSeconds: number | null;
  preparationMinutes: number | null;
  status: string;
}

export interface Supplier {
  id: number;
  legalName: string;
  displayName: string;
  lifecycleStatus: string;
  verificationStatus: string;
  stores: SupplierStore[];
}

export function fetchSupplier(token: string, supplierId: number): Promise<Supplier> {
  return apiRequest<Supplier>(`/api/v1/suppliers/${supplierId}`, { token });
}

export function fetchStore(token: string, storeId: number): Promise<SupplierStore> {
  return apiRequest<SupplierStore>(`/api/v1/supplier-stores/${storeId}`, { token });
}

// ── Orders ────────────────────────────────────────────────────────────

/** Orders awaiting this store's answer. Each carries the authoritative deadline. */
export function fetchPendingOrders(token: string, storeId: number): Promise<SupplierOrder[]> {
  return apiRequest<SupplierOrder[]>(`/api/v1/supplier-stores/${storeId}/orders/pending`, { token });
}

/** Accepted through to delivered — everything the store is still working on. */
export function fetchActiveOrders(token: string, storeId: number): Promise<SupplierOrder[]> {
  return apiRequest<SupplierOrder[]>(`/api/v1/supplier-stores/${storeId}/orders/active`, { token });
}

/**
 * Accept in full.
 *
 * <p>Carries nothing deliberately: accepting means agreeing to the order as sent.
 * Any change of quantity is a partial acceptance, which is a different decision
 * with different consequences for the restaurant (doc 04 §11).
 */
export function acceptOrder(token: string, orderId: number, idempotencyKey: string) {
  return apiRequest<SupplierOrder>(`/api/v1/supplier-orders/${orderId}/accept`, {
    method: 'POST',
    token,
    idempotencyKey,
  });
}

export interface PartialAcceptItem {
  supplierOrderItemId: number;
  /** 0 to the requested quantity. Zero declines the line and must be sent explicitly. */
  acceptedQuantity: string;
  reason?: string;
}

/**
 * Accept some of it.
 *
 * <p><b>Every line must be answered.</b> An omitted line is an unanswered line,
 * not a declined one (doc 04 §11) — so the screen sends a quantity for each,
 * including the zeroes.
 */
export function partialAcceptOrder(
  token: string,
  orderId: number,
  items: PartialAcceptItem[],
  note: string | undefined,
  idempotencyKey: string,
) {
  return apiRequest<SupplierOrder>(`/api/v1/supplier-orders/${orderId}/partial-accept`, {
    method: 'POST',
    token,
    idempotencyKey,
    body: { items, note },
  });
}

export type RejectionReason =
  | 'OUT_OF_STOCK'
  | 'UNABLE_TO_DELIVER'
  | 'STORE_CLOSED'
  | 'PRICE_ISSUE'
  | 'BELOW_MINIMUM_ORDER'
  | 'OTHER';

export function rejectOrder(
  token: string,
  orderId: number,
  reason: RejectionReason,
  note: string | undefined,
  idempotencyKey: string,
) {
  return apiRequest<SupplierOrder>(`/api/v1/supplier-orders/${orderId}/reject`, {
    method: 'POST',
    token,
    idempotencyKey,
    body: { reason, note },
  });
}

export function markPreparing(token: string, orderId: number) {
  return apiRequest<SupplierOrder>(`/api/v1/supplier-orders/${orderId}/preparing`, {
    method: 'POST',
    token,
  });
}

/** Ready for pickup. This is what starts the delivery flow (doc 05 §28). */
export function markReady(token: string, orderId: number) {
  return apiRequest<SupplierOrder>(`/api/v1/supplier-orders/${orderId}/ready`, {
    method: 'POST',
    token,
  });
}

// ── Catalog ───────────────────────────────────────────────────────────

export interface SupplierSku {
  id: number;
  supplierStoreId: number;
  canonicalProductId: number;
  canonicalProductName: string;
  skuCode: string | null;
  name: string;
  brandName: string | null;
  packSize: Money;
  packUnit: string;
  imageUrl: string | null;
  status: string;
  sellingPrice: Money;
  gstRate: Money;
  availability: string;
  availableQuantity: Money | null;
  priceEffectiveFrom: string | null;
}

export function fetchSkus(token: string, storeId: number): Promise<SupplierSku[]> {
  return apiRequest<SupplierSku[]>(`/api/v1/supplier-stores/${storeId}/skus`, { token });
}

export function updateSku(
  token: string,
  skuId: number,
  patch: Partial<{
    sellingPrice: string;
    gstRate: string;
    availability: 'AVAILABLE' | 'OUT_OF_STOCK';
    availableQuantity: string;
    status: 'ACTIVE' | 'INACTIVE';
    name: string;
    brandName: string;
  }>,
): Promise<SupplierSku> {
  return apiRequest<SupplierSku>(`/api/v1/supplier-skus/${skuId}`, {
    method: 'PATCH',
    token,
    body: patch,
  });
}
