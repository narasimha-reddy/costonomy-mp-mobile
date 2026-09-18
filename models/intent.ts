import type { Money } from '@/utils/money';

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
  productName: string | null;
  skuName: string | null;
  packLabel: string | null;
  imageUrl: string | null;
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
  withinOrderWindow: boolean;
  items: IntentItem[];
  acceptance: IntentAcceptance | null;
  supplierOrderId: number | null;
  supplierOrderNumber: string | null;
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
