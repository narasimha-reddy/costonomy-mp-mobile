import type { Money } from '@/utils/money';

/** Doc 03 §3–§6 and doc 04 §10–§11. */
export type ProcurementStatus =
  | 'CART' | 'VALIDATED' | 'PENDING_APPROVAL' | 'APPROVED'
  | 'REJECTED' | 'SUBMITTED' | 'COMPLETED' | 'CANCELLED';

export type ApprovalStatus = 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED';

export type PaymentMethod = 'PREPAID' | 'CREDIT';

export interface ProcurementItem {
  id: number;
  canonicalProductId: number;
  productName: string;
  supplierSkuId: number;
  skuName: string;
  brandName: string | null;
  packSize: Money;
  packUnit: string;
  quantity: Money;
  unit: string;
  unitPrice: Money;
  gstRate: Money;
  lineItemValue: Money;
  lineGst: Money;
  lineTotal: Money;
  availability: string;
}

/** Cart lines grouped by supplier, as §23A.16 renders them. */
export interface SupplierGroup {
  supplierStoreId: number;
  supplierName: string;
  storeName: string;
  responseSlaSeconds: number | null;
  itemValue: Money;
  gst: Money;
  total: Money;
  items: ProcurementItem[];
}

/**
 * A price that moved between adding to cart and checking out.
 *
 * <p>Both figures are present because §23A.16 requires old and new to be shown
 * and the change explicitly confirmed. Never absorb the difference.
 */
export interface PriceChange {
  procurementItemId: number;
  productName: string;
  supplierName: string;
  previousUnitPrice: Money;
  newUnitPrice: Money;
  previousLineTotal: Money;
  newLineTotal: Money;
}

/** Something preventing submission, with a reason the restaurant can act on. */
export interface Blocker {
  procurementItemId: number | null;
  code: string;
  message: string;
}

/**
 * A cart or an order depending on `status`. Doc 05 §11: the restaurant sees one
 * thing even though the backend splits it by supplier.
 *
 * <p><b>Every figure here is the server's.</b> Guardrail 3 — the app renders
 * `totalAmount`, it never computes one.
 */
export interface Procurement {
  id: number;
  outletId: number;
  requirementId: number | null;
  status: ProcurementStatus;
  approvalStatus: ApprovalStatus;
  approvalReason: string | null;
  approverRoles: string[];
  paymentMethod: PaymentMethod | null;
  totalItemValue: Money;
  totalGst: Money;
  totalDeliveryFee: Money;
  totalAmount: Money;
  validatedAt: string | null;
  validationStale: boolean;
  submittable: boolean;
  supplierGroups: SupplierGroup[];
  priceChanges: PriceChange[];
  blockers: Blocker[];
}

// ── Requirements ──────────────────────────────────────────────────────

export type RequirementStatus =
  | 'OPEN' | 'SOURCING' | 'PARTIALLY_FULFILLED' | 'FULFILLED' | 'CANCELLED';

export interface RequirementItem {
  id: number;
  canonicalProductId: number;
  productName: string;
  requestedQuantity: Money;
  fulfilledQuantity: Money;
  /** What is still needed. §23A.14 requires this to be explicit. */
  remainingQuantity: Money;
  unit: string;
  status: string;
  notes: string | null;
}

export interface Requirement {
  id: number;
  outletId: number;
  status: RequirementStatus;
  source: string;
  notes: string | null;
  neededBy: string | null;
  createdAt: string;
  items: RequirementItem[];
}

// ── Supplier orders ───────────────────────────────────────────────────

export type SupplierOrderStatus =
  | 'DRAFT' | 'PENDING_ACCEPTANCE' | 'ACCEPTED' | 'PARTIALLY_ACCEPTED'
  | 'REJECTED' | 'EXPIRED' | 'PREPARING' | 'READY_FOR_PICKUP'
  | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'RECEIVED' | 'CANCELLED';

/**
 * A line on a supplier order.
 *
 * <p>Mirrors `SupplierOrderItemResponse` exactly. Note it carries
 * `requestedQuantity`, not `quantity`, and no pack fields — a supplier order line
 * is denominated in the ordering unit, and the pack it came from belongs to the
 * SKU rather than to the order.
 */
export interface SupplierOrderItem {
  id: number;
  canonicalProductId: number;
  productName: string;
  skuName: string;
  requestedQuantity: Money;
  /** Null until the supplier answers; zero means they declined this line. */
  acceptedQuantity: Money | null;
  unit: string;
  unitPrice: Money;
  gstRate: Money;
  lineTotal: Money;
  status: string;
}

export interface SupplierOrder {
  id: number;
  orderNumber: string;
  supplierStoreId: number;
  supplierName: string;
  storeName: string;
  status: SupplierOrderStatus;
  /** The authoritative deadline. Count down to this, never to a local timer. */
  acceptanceDeadline: string | null;
  responseSlaSeconds: number | null;
  subtotal: Money;
  gstAmount: Money;
  totalAmount: Money;
  acceptedAmount: Money | null;
  paymentMethod: PaymentMethod | null;
  paymentStatus: string | null;
  items: SupplierOrderItem[];
}

/**
 * What the client must pay, one per supplier order.
 *
 * <p>The orders sit in DRAFT and **no supplier can see them** until each payment
 * authorises — guardrail 16, D-020.
 */
export interface PaymentIntent {
  supplierOrderId: number;
  paymentId: number;
  provider: string;
  providerOrderId: string;
  amount: Money;
  currency: string;
  /** Publishable key. Never a secret. */
  publicKey: string | null;
}

export interface SubmitResponse {
  procurementId: number;
  status: ProcurementStatus;
  supplierOrders: SupplierOrder[];
  paymentIntents: PaymentIntent[];
}
