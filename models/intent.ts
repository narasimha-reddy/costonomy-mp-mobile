import type { Money } from '@/utils/money';
import type { SkuDescriptor } from '@/utils/skuLabel';

/**
 * Requests — what a restaurant asks a supplier for, before any money. D-088.
 *
 * <p>The server's spellings, verbatim. Guessing them is how a union ends up
 * comparing against statuses the API has never sent, which type-checks perfectly
 * and is silently false everywhere.
 */
export type IntentStatus =
  | 'DRAFT'
  | 'OPEN'
  | 'RESPONSES_RECEIVED'
  | 'ORDERED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'ORDER_CREATION_EXPIRED';

/**
 * How much of a request the supplier agreed to.
 *
 * <p>Separate from the status, and not derivable from it: a request can be
 * `ORDERED` and only a third filled. This is the axis the restaurant's filter
 * runs on, because "what didn't I get?" is the question they are asking.
 *
 * <p>`AWAITING` is not zero. Nobody has answered; `NOT_FULFILLED` is a supplier
 * saying no.
 */
export type IntentFulfilment =
  | 'AWAITING'
  | 'FULFILLED'
  | 'PARTIALLY_FULFILLED'
  | 'NOT_FULFILLED';

export type IntentAcceptanceStatus = 'DRAFT' | 'SUBMITTED' | 'EXPIRED';

/** One line, with the supplier's answer to it folded in. */
export interface IntentItem {
  id: number;
  supplierSkuId: number;
  canonicalProductId: number;
  /** One shape for every screen that shows a pack. See `utils/skuLabel.ts`. */
  sku: SkuDescriptor | null;
  requestedQuantity: Money;
  unit: string;
  notes: string | null;
  status: string;
  fulfilment: IntentFulfilment;
  /** Null until the supplier answers. Zero means they declined this line. */
  offeredQuantity: Money | null;
  availability: string | null;
  unitPrice: Money | null;
  lineValue: Money | null;
  lineGst: Money | null;
  lineTotal: Money | null;
  gstRate: Money | null;
  supplierNotes: string | null;
  /**
   * The price this line is asked at, and what it comes to.
   *
   * <p>Real, not an estimate. A draft carries the supplier's current price;
   * sending locks it, and the reply confirms that price or declines the line.
   * Null when the SKU has no live offer — absent rather than zero, because a
   * missing price is not a free product.
   */
  agreedUnitPrice: Money | null;
  /** The same price with GST added, computed by the server. */
  agreedUnitPriceInclusiveGst: Money | null;
  agreedGstRate: Money | null;
  agreedLineValue: Money | null;
  agreedLineGst: Money | null;
  agreedLineTotal: Money | null;
  /** The supplier repriced since this was added. Draft-only. */
  priceChanged: boolean;
  previousUnitPrice: Money | null;
}

/** The supplier's commercial statement. A quote, not a transaction. */
export interface IntentAcceptance {
  id: number;
  status: IntentAcceptanceStatus;
  offeredValue: Money;
  offeredGst: Money;
  offeredTotal: Money;
  deliveryFee: Money | null;
  etaMinutes: number | null;
  deliveryMode: string | null;
  notes: string | null;
  submittedAt: string | null;
  expiresAt: string | null;
}

export interface Intent {
  id: number;
  reference: string;
  outletId: number;
  supplierStoreId: number;
  storeName: string | null;
  supplierName: string | null;
  status: IntentStatus;
  fulfilment: IntentFulfilment;
  source: string;
  clonedFromId: number | null;
  requestedDeliveryTime: string | null;
  notes: string | null;
  sentAt: string | null;
  /**
   * When the supplier's chance to answer runs out — their store's own SLA,
   * frozen when the request was sent.
   *
   * <p>Distinct from `orderCreationDeadline`, and they belong to different
   * people: this one is the supplier's, that one the restaurant's. Only one is
   * ever live at a time.
   */
  responseDeadline: string | null;
  responseWindowSeconds: number | null;
  acceptedAt: string | null;
  /**
   * When the chance to order from this answer runs out.
   *
   * <p>Count down to this instant, never from a local duration — see
   * `lib/server-clock.ts`. `serverTime` on the same response is what the offset
   * is taken from.
   */
  orderCreationDeadline: string | null;
  orderCreationWindowSeconds: number | null;
  cancelledAt: string | null;
  expiredAt: string | null;
  createdAt: string;
  /** The instant the server built this response. */
  serverTime: string;
  editable: boolean;
  /** Which revision of this request you are looking at. */
  revision: number;
  /**
   * Whether a line's quantity may still be changed. True through OPEN, where
   * `editable` is already false — a sent request is fixed in shape but not in
   * quantity until the supplier answers. See D-088.
   */
  quantityEditable: boolean;
  withinOrderWindow: boolean;
  items: IntentItem[];
  agreedValue: Money | null;
  agreedGst: Money | null;
  agreedTotal: Money | null;
  /** False when a line has no price, so the total is short of the whole. */
  pricedComplete: boolean;
  /** True when a line has been repriced since it was added. */
  priceChanged: boolean;
  acceptance: IntentAcceptance | null;
  supplierOrderId: number | null;
  supplierOrderNumber: string | null;
}

/**
 * The basket: every unsent request, and what the lot would come to.
 *
 * <p>The totals come from the server rather than being summed here. Adding up
 * money on the client is what guardrail 3 forbids, and a client-side sum of
 * rounded per-supplier figures is exactly the kind that ends up a paisa off.
 */
export interface Basket {
  requests: Intent[];
  supplierCount: number;
  itemCount: number;
  agreedValue: Money;
  agreedGst: Money;
  agreedTotal: Money;
  pricedComplete: boolean;
  priceChanged: boolean;
}

/** One line's repricing, old and new, as the send flow reports it. */
export interface RequestPriceChange {
  intentItemId: number;
  productName: string | null;
  previousUnitPrice: Money;
  currentUnitPrice: Money;
  previousLineTotal: Money | null;
  currentLineTotal: Money | null;
}

/** A request held back because its prices moved. */
export interface HeldRequest {
  intentId: number;
  reference: string;
  storeName: string | null;
  changes: RequestPriceChange[];
}

/**
 * What went and what is waiting.
 *
 * <p>Requests whose prices have not moved are sent immediately; repriced ones
 * are held, so one supplier's overnight rise does not stall the others.
 */
export interface SendBasketResult {
  sent: Intent[];
  held: HeldRequest[];
}

/**
 * What a supplier's reply would come to, priced by the server.
 *
 * <p>The app cannot work this out itself — multiplying a price by a quantity is
 * money arithmetic — so the stepper's effect on the total is a round trip.
 */
export interface RespondPreview {
  intentId: number;
  lines: RespondPreviewLine[];
  offeredValue: Money;
  offeredGst: Money;
  offeredTotal: Money;
}

export interface RespondPreviewLine {
  intentItemId: number;
  productName: string | null;
  requestedQuantity: Money;
  offeredQuantity: Money;
  unit: string;
  unitPrice: Money | null;
  gstRate: Money | null;
  lineValue: Money | null;
  lineGst: Money | null;
  lineTotal: Money | null;
}

/** What creating the order right now would cost. */
export interface OrderPreview {
  intentId: number;
  creatable: boolean;
  orderCreationDeadline: string | null;
  serverTime: string;
  lines: OrderPreviewLine[];
  subtotal: Money;
  gstAmount: Money;
  total: Money;
  /**
   * Only things that make the order impossible.
   *
   * <p>There is no price-change list: an acceptance is a quote with a deadline,
   * and inside the deadline the quoted price holds.
   */
  blockers: OrderBlocker[];
}

export interface OrderPreviewLine {
  intentItemId: number;
  supplierSkuId: number;
  productName: string | null;
  skuName: string | null;
  offeredQuantity: Money;
  quantity: Money;
  unit: string;
  unitPrice: Money;
  gstRate: Money;
  lineValue: Money;
  lineGst: Money;
  lineTotal: Money;
}

export interface OrderBlocker {
  intentItemId: number | null;
  productName: string | null;
  code: string;
  message: string;
}

export interface IntentPaymentIntent {
  supplierOrderId: number;
  paymentId: number;
  provider: string;
  providerOrderId: string;
  amount: Money;
  currency: string;
  publicKey: string | null;
}

export interface CreatedOrder {
  intentId: number;
  supplierOrderId: number;
  orderNumber: string;
  totalAmount: Money;
  paymentMethod: string;
  paymentStatus: string;
  payment: IntentPaymentIntent | null;
}

/** How a request's fulfilment reads to a person. */
export const FULFILMENT_LABELS: Record<IntentFulfilment, string> = {
  AWAITING: 'Waiting for a reply',
  FULFILLED: 'Available in full',
  PARTIALLY_FULFILLED: 'Partly available',
  NOT_FULFILLED: 'Not available',
};
