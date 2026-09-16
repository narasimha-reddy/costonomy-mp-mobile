import { apiRequest } from '@/lib/api/client';
import type { IncomingOrder, SupplierOrder } from '@/models/procurement';
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
  gstin: string | null;
  lifecycleStatus: string;
  verificationStatus: string;
  /** Whether this supplier can currently receive orders. The server's answer. */
  canTrade: boolean;
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
export function fetchPendingOrders(token: string, storeId: number): Promise<IncomingOrder[]> {
  return apiRequest<IncomingOrder[]>(`/api/v1/supplier-stores/${storeId}/orders/pending`, { token });
}

/** Accepted through to delivered — everything the store is still working on. */
export function fetchActiveOrders(token: string, storeId: number): Promise<IncomingOrder[]> {
  return apiRequest<IncomingOrder[]>(`/api/v1/supplier-stores/${storeId}/orders/active`, { token });
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

/**
 * Advance an accepted order.
 *
 * <p><b>Both require an idempotency key</b>, as a header — the server rejects the
 * call outright without one, which is the right call for a state transition a
 * retry could otherwise apply twice.
 */
export function markPreparing(token: string, orderId: number, idempotencyKey: string) {
  return apiRequest<SupplierOrder>(`/api/v1/supplier-orders/${orderId}/preparing`, {
    method: 'POST',
    token,
    idempotencyKey,
  });
}

/** Ready for pickup. This is what starts the delivery flow (doc 05 §28). */
export function markReady(token: string, orderId: number, idempotencyKey: string) {
  return apiRequest<SupplierOrder>(`/api/v1/supplier-orders/${orderId}/ready`, {
    method: 'POST',
    token,
    idempotencyKey,
  });
}

// ── Catalog ───────────────────────────────────────────────────────────

export interface SupplierSku {
  id: number;
  supplierStoreId: number;
  canonicalProductId: number;
  canonicalProductName: string;
  /** The canonical product's category, for grouping a supplier's own catalog. */
  categoryId: number | null;
  skuCode: string | null;
  name: string;
  brandName: string | null;
  packSize: Money;
  packUnit: string;
  /** This SKU's own picture — the supplier's pack. Usually null. */
  imageUrl: string | null;
  /**
   * The canonical product's picture, so a listing has a face even when the
   * supplier has not given it one. Kept separate from `imageUrl` rather than
   * merged: a screen showing a supplier what *they* uploaded has to be able to
   * tell their picture from the platform's.
   */
  canonicalProductImageUrl: string | null;
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
    /** Empty string clears it, returning the listing to the catalog picture. */
    imageUrl: string;
  }>,
): Promise<SupplierSku> {
  return apiRequest<SupplierSku>(`/api/v1/supplier-skus/${skuId}`, {
    method: 'PATCH',
    token,
    body: patch,
  });
}

// ── Editing the business ──────────────────────────────────────────────

export interface UpdateSupplierInput {
  legalName?: string;
  displayName?: string;
  gstin?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
}

export function updateSupplier(
  token: string,
  supplierId: number,
  patch: UpdateSupplierInput,
): Promise<Supplier> {
  return apiRequest<Supplier>(`/api/v1/suppliers/${supplierId}`, {
    method: 'PATCH',
    token,
    body: patch,
  });
}

export interface UpdateStoreInput {
  name?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  pincode?: string;
  latitude?: string;
  longitude?: string;
  contactName?: string;
  contactPhone?: string;
  responseSlaSeconds?: number;
  preparationMinutes?: number;
  /** ACTIVE or OFFLINE. Going offline stops new orders without closing the store. */
  status?: 'ACTIVE' | 'OFFLINE';
}

export function updateStore(
  token: string,
  storeId: number,
  patch: UpdateStoreInput,
): Promise<SupplierStore> {
  return apiRequest<SupplierStore>(`/api/v1/supplier-stores/${storeId}`, {
    method: 'PATCH',
    token,
    body: patch,
  });
}

export function fetchVerification(token: string, supplierId: number) {
  return apiRequest<{
    id: number;
    verificationType: string;
    status: string;
    rejectionReason: string | null;
    verifiedAt: string | null;
    createdAt: string;
  }>(`/api/v1/suppliers/${supplierId}/verification`, { token });
}

// ── Creating a SKU ────────────────────────────────────────────────────

export interface CreateSkuInput {
  canonicalProductId: number;
  skuCode?: string;
  name: string;
  brandName?: string;
  packSize: string;
  packUnit: string;
  imageUrl?: string;
  sellingPrice: string;
  gstRate: string;
  availability?: 'AVAILABLE' | 'OUT_OF_STOCK';
  availableQuantity?: string;
}

/**
 * List a product this store sells.
 *
 * <p>`canonicalProductId` ties it to the platform's product, which is what lets a
 * restaurant compare this listing against other suppliers'. A SKU with no
 * canonical product would be invisible in every comparison — which is why the
 * server requires it and there is deliberately no API for a supplier to invent a
 * canonical product of their own (doc 01 §7).
 */
export function createSku(
  token: string,
  storeId: number,
  input: CreateSkuInput,
): Promise<SupplierSku> {
  return apiRequest<SupplierSku>(`/api/v1/supplier-stores/${storeId}/skus`, {
    method: 'POST',
    token,
    body: input,
  });
}

export function fetchPriceHistory(token: string, skuId: number) {
  return apiRequest<{
    sellingPrice: string;
    gstRate: string;
    availability: string;
    effectiveFrom: string;
    effectiveTo: string | null;
  }[]>(`/api/v1/supplier-skus/${skuId}/price-history`, { token });
}
