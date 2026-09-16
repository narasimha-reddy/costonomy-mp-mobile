import type { Money } from '@/utils/money';

/**
 * Doc 03 §3–§6 and doc 04 §10–§11.
 *
 * <p>These are the server's spellings, verbatim. They were not: this union once
 * said CART, VALIDATED and COMPLETED, none of which the API has ever sent, and
 * every comparison against them was silently false while type-checking perfectly.
 */
export type ProcurementStatus =
  | 'DRAFT' | 'VALIDATING' | 'READY' | 'PENDING_APPROVAL' | 'APPROVED'
  | 'SUBMITTED' | 'REJECTED' | 'CANCELLED' | 'FAILED';

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
  | 'OPEN' | 'SOURCING' | 'PARTIALLY_FULFILLED' | 'FULFILLED' | 'CANCELLED' | 'EXPIRED';

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

/**
 * The server's spellings, verbatim.
 *
 * <p>An order the supplier accepts in full is **CONFIRMED**, not `ACCEPTED`, and
 * a received order is **COMPLETED**, not `RECEIVED`. This union said otherwise,
 * so `order.status === 'ACCEPTED'` compiled — it is a member of the declared
 * union — and was never once true. The supplier's "Start preparing" button sat
 * behind that comparison and simply never appeared.
 */
export type SupplierOrderStatus =
  | 'DRAFT' | 'PENDING_ACCEPTANCE' | 'CONFIRMED' | 'PARTIALLY_ACCEPTED'
  | 'REJECTED' | 'EXPIRED' | 'PREPARING' | 'READY_FOR_PICKUP'
  | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'COMPLETED' | 'CANCELLED';

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
  /**
   * Where the order is going. The order number identifies it to a system; the
   * outlet and the restaurant identify it to a person.
   */
  outletId: number;
  outletName: string | null;
  restaurantName: string | null;
  /** Landmark, else the street line. Where the van actually goes. */
  outletLocality: string | null;
  outletCity: string | null;
  /** Kilometres from the supplier's store, or null when either end is unlocated. */
  distanceKm: Money | null;
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
 * A supplier's view of an order that arrived for one of their stores.
 *
 * <p>Mirrors `IncomingOrderResponse`, which is **not** `SupplierOrderResponse`:
 * it is the same order seen from the other side of the trade. It carries
 * `secondsRemaining` and the buyer's identity, and it deliberately omits
 * `supplierName`, `storeName` and `paymentStatus` — the supplier knows who they
 * are, and how the restaurant paid is not theirs to see beyond the method.
 */
export interface IncomingOrder {
  id: number;
  orderNumber: string;
  outletId: number;
  outletName: string | null;
  restaurantName: string | null;
  outletLocality: string | null;
  outletCity: string | null;
  /** Kilometres from this store, or null when either end is unlocated. */
  distanceKm: Money | null;
  status: SupplierOrderStatus;
  /** The authoritative deadline. Count down to this, never to a local timer. */
  acceptanceDeadline: string | null;
  responseSlaSeconds: number | null;
  /** The server's starting point for the countdown, not a substitute for the deadline. */
  secondsRemaining: number;
  subtotal: Money;
  gstAmount: Money;
  totalAmount: Money;
  /** What the store committed to. Zero before they answer, below the total after a partial. */
  acceptedAmount: Money;
  paymentMethod: PaymentMethod | null;
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
