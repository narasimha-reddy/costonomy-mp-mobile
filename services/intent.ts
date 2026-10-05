import { apiRequest, newIdempotencyKey } from '@/lib/api/client';
import type { DeliveryMode } from '@/models/procurement';
import type {
  Basket,
  CreatedOrder,
  DeliveryQuote,
  DirectOrderResult,
  Intent,
  IntentFulfilment,
  IntentStatus,
  OrderPreview,
  RespondPreview,
  SendBasketResult,
} from '@/models/intent';

// ── The basket ────────────────────────────────────────────────────────

/**
 * The outlet's unsent requests, one per supplier.
 *
 * <p>This is the cart. There is no single cart resource any more: the split into
 * one request per supplier happens while shopping, which is what keeps one
 * request to one order.
 */
export function fetchDrafts(token: string, outletId: number): Promise<Basket> {
  return apiRequest<Basket>(`/api/v1/outlets/${outletId}/intent-drafts`, { token });
}

/**
 * Put a supplier's pack on a request.
 *
 * <p>Takes a SKU, not an offer: a request records what is wanted, and no price.
 * The supplier's answer is what decides the cost.
 */
export function addIntentItem(
  token: string,
  outletId: number,
  body: { supplierSkuId: number; quantity: string; notes?: string },
): Promise<Intent> {
  return apiRequest<Intent>(`/api/v1/outlets/${outletId}/intent-items`, {
    method: 'POST',
    token,
    body,
  });
}

/** Change a line's quantity. Zero removes it. */
export function updateIntentItem(
  token: string,
  itemId: number,
  quantity: string,
): Promise<Intent> {
  return apiRequest<Intent>(`/api/v1/intent-items/${itemId}`, {
    method: 'PATCH',
    token,
    body: { quantity },
  });
}

export function removeIntentItem(token: string, itemId: number): Promise<Intent> {
  return apiRequest<Intent>(`/api/v1/intent-items/${itemId}`, { method: 'DELETE', token });
}

// ── Sending and following ─────────────────────────────────────────────

/**
 * Send the basket — one request per supplier, in one call.
 *
 * <p>Repriced requests come back in `held` rather than going out. Re-send with
 * `acceptPriceChanges` once the user has seen them.
 *
 * <p>`intentId` narrows it to one supplier's request. It goes through here
 * rather than through `sendIntent` on purpose: that endpoint neither checks for
 * repricing nor re-snapshots the price, so one supplier sent that way could be
 * quoted a figure nobody agreed to.
 */
export function sendBasket(
  token: string,
  outletId: number,
  body: {
    acceptPriceChanges?: boolean;
    requestedDeliveryTime?: string;
    /** `YYYY-MM-DD`; leave out for immediate. */
    preferredDeliveryDate?: string;
    notes?: string;
    intentId?: number;
  } = {},
): Promise<SendBasketResult> {
  return apiRequest<SendBasketResult>(`/api/v1/outlets/${outletId}/intent-drafts/send`, {
    method: 'POST',
    token,
    body,
  });
}

/**
 * Make a draft orderable without sending a request. D-094.
 *
 * <p>For a store that keeps stock. Comes back with the request ready to order
 * from, or with `held` when a price moved since the line was added — the same
 * shape the basket returns, so the cart shows the change with the sheet it
 * already has. Call again with `acceptPriceChanges` to agree and proceed.
 */
export function prepareDirectOrder(
  token: string,
  intentId: number,
  acceptPriceChanges = false,
): Promise<DirectOrderResult> {
  return apiRequest<DirectOrderResult>(`/api/v1/intents/${intentId}/direct-order`, {
    method: 'POST',
    token,
    body: { acceptPriceChanges },
  });
}

export function sendIntent(
  token: string,
  intentId: number,
  body: { requestedDeliveryTime?: string; preferredDeliveryDate?: string; notes?: string } = {},
): Promise<Intent> {
  return apiRequest<Intent>(`/api/v1/intents/${intentId}/send`, {
    method: 'POST',
    token,
    body,
  });
}

/** Sent requests, optionally narrowed by what the supplier agreed to. */
export function fetchIntents(
  token: string,
  outletId: number,
  fulfilment?: IntentFulfilment,
): Promise<Intent[]> {
  const query = fulfilment ? `?fulfilment=${fulfilment}` : '';
  return apiRequest<Intent[]>(`/api/v1/outlets/${outletId}/intents${query}`, { token });
}

export function fetchIntent(token: string, intentId: number): Promise<Intent> {
  return apiRequest<Intent>(`/api/v1/intents/${intentId}`, { token });
}

export function cancelIntent(token: string, intentId: number): Promise<Intent> {
  return apiRequest<Intent>(`/api/v1/intents/${intentId}/cancel`, { method: 'POST', token });
}

/** Copy a finished request into a fresh draft — how a request is repeated. */
export function cloneIntent(token: string, intentId: number): Promise<Intent> {
  return apiRequest<Intent>(`/api/v1/intents/${intentId}/clone`, { method: 'POST', token });
}

// ── Ordering ──────────────────────────────────────────────────────────

/** What ordering this would cost. Changes nothing. */
/**
 * What our delivery would cost for this request. D-091.
 *
 * <p>No idempotency key: quoting is a read with a receipt. The reference comes
 * back and is spent when the order is created, so the restaurant is charged the
 * figure they were shown rather than one recomputed a minute later (§23A.16).
 */
export function quoteDelivery(
  token: string,
  intentId: number,
): Promise<DeliveryQuote> {
  return apiRequest<DeliveryQuote>(`/api/v1/intents/${intentId}/delivery-quote`, {
    method: 'POST',
    token,
  });
}

export function previewOrder(
  token: string,
  intentId: number,
  body: {
    lines?: { intentItemId: number; quantity: string }[];
    /** Asked about, not committed to — the preview never spends a quote. */
    deliveryMode?: DeliveryMode;
    deliveryQuoteReference?: string;
  } = {},
): Promise<OrderPreview> {
  return apiRequest<OrderPreview>(`/api/v1/intents/${intentId}/orders/preview`, {
    method: 'POST',
    token,
    body,
  });
}

/**
 * Create the order. The financial step.
 *
 * <p>Carries an `Idempotency-Key` because a duplicate here would charge for two
 * orders. Disabling the button while the request is in flight is a courtesy, not
 * the mechanism.
 */
export function createOrderFromIntent(
  token: string,
  intentId: number,
  body: {
    lines?: { intentItemId: number; quantity: string }[];
    paymentMethod?: string;
    /**
     * How the goods travel. Required — D-091.
     *
     * <p>The fee is part of what is charged, so the mode has to be settled
     * before the payment intent exists rather than added afterwards.
     */
    deliveryMode: DeliveryMode;
    /** The quote being spent, for `COSTONOMY_DELIVERY`. */
    deliveryQuoteReference?: string;
    deliverySlotId?: number;
    scheduledDeliveryDate?: string;
  },
  /**
   * The caller's key for this attempt. Pass the same one for a repeat of the same
   * order — a double tap, a retry — so the server answers it once instead of
   * treating it as a second order and refusing the already-spent delivery quote.
   */
  idempotencyKey: string = newIdempotencyKey(),
): Promise<CreatedOrder> {
  return apiRequest<CreatedOrder>(`/api/v1/intents/${intentId}/orders`, {
    method: 'POST',
    token,
    body,
    idempotencyKey,
  });
}

// ── The supplier's side ───────────────────────────────────────────────

/** The newest requests worth looking at. Capped at ten by the server. */
export function fetchStoreIntentCarousel(token: string, storeId: number): Promise<Intent[]> {
  return apiRequest<Intent[]>(`/api/v1/supplier-stores/${storeId}/intents/carousel`, { token });
}

export function fetchStoreIntents(
  token: string,
  storeId: number,
  status?: IntentStatus,
): Promise<Intent[]> {
  const query = status ? `?status=${status}` : '';
  return apiRequest<Intent[]>(`/api/v1/supplier-stores/${storeId}/intents${query}`, { token });
}

/**
 * Answer a request.
 *
 * <p>Every line must appear; offer `"0"` to decline one. No prices are sent —
 * each line is priced from this store's live catalogue offer, so a price changes
 * by editing the listing rather than by answering differently.
 */
/**
 * What a reply would come to. Writes nothing.
 *
 * <p>Round-trips because the app must not multiply a price by a quantity
 * itself, so a supplier moving a stepper needs the server to do the sum.
 */
export function previewResponse(
  token: string,
  intentId: number,
  lines: { intentItemId: number; offeredQuantity: string }[],
): Promise<RespondPreview> {
  return apiRequest<RespondPreview>(`/api/v1/intents/${intentId}/respond/preview`, {
    method: 'POST',
    token,
    body: { lines },
  });
}

export function respondToIntent(
  token: string,
  intentId: number,
  body: {
    lines: { intentItemId: number; offeredQuantity: string; notes?: string }[];
    /** The revision the supplier was reading. The server refuses a stale one. */
    expectedRevision?: number;
    etaMinutes?: number;
    deliveryMode?: string;
    /** How the supplier will deliver this request; leave out to keep the store's settings (API D-141). */
    deliveryOffer?: 'SELF_FREE' | 'SELF' | 'COSTONOMY';
    /** With SELF: the charge for this request, at most the store's own fee; leave out for the store's fee. */
    deliveryFee?: string;
    notes?: string;
  },
): Promise<Intent> {
  return apiRequest<Intent>(`/api/v1/intents/${intentId}/respond`, {
    method: 'POST',
    token,
    body,
    idempotencyKey: newIdempotencyKey(),
  });
}
