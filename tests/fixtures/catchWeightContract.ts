/**
 * The catch-weight, receiving, subscription and wallet bodies as the API writes them, taken from
 * costonomy-mp-api `phase5/api-flags` (which includes every earlier phase): the DTO records
 * (`ProcurementDtos.SupplierOrderResponse`/`SupplierOrderItemResponse`, `TrustDtos.ReceivingResponse`,
 * `WalletDtos.EntryResponse`, `SubscriptionDtos`, `IntentDtos`) and the figures its ITs assert
 * (`CatchWeightSettlementIT`, `SubscriptionGenerationIT`, `ColdChainIT`).
 *
 * Raw JSON on purpose: money as JSON numbers, exactly as the server writes them (`BigDecimal` is not a string
 * on the wire), so any code that calls a string method on a money value fails here as it would on a phone.
 * The app's earlier mocks used strings and an inverted adjustment sign, and could not catch either.
 *
 * One example throughout (`CatchWeightSettlementIT`): 10 kg of chicken at Rs 100/kg + 5% GST, so Rs 1,050 was
 * accepted. The scale says 9.6 kg: billed 9.6 kg, Rs 1,008, and the Rs 42 difference is the buyer's refund.
 */

/** `WalletDtos.EntryResponse` for the Rs 42 the wallet gets back at ready (`underweightReturnsTheDifferenceOnce`). */
export const ORDER_ADJUSTMENT_CREDIT = {
  id: 9001,
  direction: 'CREDIT',
  kind: 'ORDER_ADJUSTMENT',
  amount: 42.0,
  balanceAfter: 3992.0,
  supplierOrderId: 501,
  reason: 'Order weighed lighter than ordered',
  refundStatus: null,
  at: '2026-10-05T06:30:00Z',
  bill: null,
};

/** The legacy over-weight surcharge that old data may still hold (removed in D-128; a debit). */
export const ORDER_ADJUSTMENT_DEBIT = { ...ORDER_ADJUSTMENT_CREDIT, id: 9002, direction: 'DEBIT', amount: 15.5, balanceAfter: 3976.5 };

// ── The supplier's order, before and after the scale (`ProcurementDtos.SupplierOrderResponse`) ──────────────

const sku = { supplierSkuId: 77, productName: 'Chicken', skuName: 'Chicken', brandName: null, packSize: 1, packUnit: 'KG', measureValue: null, measureUnit: null, imageUrl: null, status: 'ACTIVE', isCatchWeight: true, requiresColdChain: false };

/** One catch-weight line: 10 KG at Rs 100 + 5% GST. `reading` null means not weighed yet. */
function line(over: Record<string, unknown> = {}) {
  return {
    id: 301, canonicalProductId: 55, supplierSkuId: 77, productName: 'Chicken', productImageUrl: null, sku,
    requestedQuantity: 10, acceptedQuantity: 10, fulfilledQuantity: null,
    dispatchedWeight: null, billableQuantity: null, weighedAt: null, weightDeltaAmount: null,
    doorstepAcceptedQty: null, doorstepRejectedQty: null, doorstepRejectionReason: null, doorstepRefundAmount: null,
    requiresColdChain: false, isCatchWeight: true, unit: 'KG', unitPrice: 100, unitPriceInclusiveGst: 105, gstRate: 5,
    lineTotal: 1050,
    ...over,
  };
}

function order(status: string, over: Record<string, unknown>, item: Record<string, unknown>) {
  return {
    id: 501, orderNumber: 'MP-261005-000501', supplierStoreId: 12, supplierName: 'Fresh Meats', storeName: 'Fresh Meats store',
    outletId: 3, outletName: 'Banjara Hills', restaurantName: 'Paradise', outletLocality: null, outletCity: 'Hyderabad',
    distanceKm: 7.1, status, acceptanceDeadline: null, responseSlaSeconds: null, createdAt: '2026-10-05T05:00:00Z',
    subtotal: 1000, gstAmount: 50, totalAmount: 1050, acceptedAmount: 1050, acceptedSubtotal: 1000, acceptedGst: 50,
    weightAdjustmentAmount: null, doorstepRefundAmount: null, finalPayableAmount: null,
    paymentMethod: 'WALLET', paymentStatus: 'PAID', paymentInstrument: null, deliveryMode: 'PICKUP', deliveryFee: 0,
    deliverySlotId: null, deliverySlotName: null, scheduledDeliveryDate: null, isSubscriptionOrder: false, subscriptionId: null,
    hasColdChainItems: false, cancelledBy: null, cancellationReason: null, refundAmount: null, refundedAt: null,
    items: [line(item)],
    ...over,
  };
}

/** Confirmed, nothing weighed: the weigh sheet may open, "Mark ready" may not be used. */
export const ORDER_CONFIRMED_UNWEIGHED = order('CONFIRMED', {}, {});

/** Weighed at 9.6 KG before ready, as `underweightReturnsTheDifferenceOnce` leaves it: billed 9.6, Rs 42 back, Rs 1,008 payable. */
export const ORDER_PREPARING_WEIGHED_9_6 = order('PREPARING', { weightAdjustmentAmount: 42, finalPayableAmount: null },
  { dispatchedWeight: 9.6, billableQuantity: 9.6, weighedAt: '2026-10-05T06:20:00Z', weightDeltaAmount: 42, lineTotal: 1008 });

/** Ready, settled: the money is fixed and weighing is over (`weighingAfterReadyIsRefused`). */
export const ORDER_READY_SETTLED_9_6 = order('READY_FOR_PICKUP', { weightAdjustmentAmount: 42, finalPayableAmount: 1008 },
  { dispatchedWeight: 9.6, billableQuantity: 9.6, weighedAt: '2026-10-05T06:20:00Z', weightDeltaAmount: 42, lineTotal: 1008 });

/** 10.4 KG on the scale, 10 accepted: billed at the accepted 10 (`overweightWithinBandIsBilledAtAccepted`), nothing extra. */
export const ORDER_READY_OVERWEIGHT_10_4 = order('READY_FOR_PICKUP', { weightAdjustmentAmount: 0, finalPayableAmount: 1050 },
  { dispatchedWeight: 10.4, billableQuantity: 10, weighedAt: '2026-10-05T06:20:00Z', weightDeltaAmount: 0, lineTotal: 1050 });

/** The API's error envelope (`{ data, error: { code, message }, meta }`), with the messages `CatchWeight` writes. */
export const apiError = (code: string, message: string) => ({ data: null, error: { code, message }, meta: { requestId: 'r-1' } });
export const REFUSAL_EMPTY = apiError('VALIDATION_ERROR', 'Enter the weight shown on the scale.');
export const REFUSAL_DECIMALS = apiError('VALIDATION_ERROR', 'A scale reading has at most 3 decimal places.');
export const REFUSAL_RANGE = apiError('VALIDATION_ERROR',
  '12 is outside the allowed range of 8 to 11 for this line (ordered 10). Check the scale, or ask the buyer to cancel and re-order.');
export const REFUSAL_NOT_A_WEIGHT_UNIT = apiError('VALIDATION_ERROR',
  'Only lines sold by weight (GM, KG, OZ, LB) can be weighed; this one is sold by PKT.');
export const REFUSAL_AFTER_READY = apiError('INVALID_STATE_TRANSITION', 'Weights can only be recorded before the order is marked ready.');
export const REFUSAL_UNWEIGHED = apiError('VALIDATION_ERROR', 'Weigh every catch-weight line before marking the order ready.');

// ── The restaurant's check-in (`TrustDtos.ReceivingResponse`) ───────────────────────────────────────────────

function receivingItem(over: Record<string, unknown> = {}) {
  return {
    id: 801, supplierOrderItemId: 301, productName: 'Chicken', requestedQuantity: 10, acceptedQuantity: 10,
    receivedQuantity: 9.5, damagedQuantity: 0, missingQuantity: 0.1, rejectionReason: 'SHORT_DELIVERY',
    refundAmount: 10.5, unit: 'KG', note: null, ...over,
  };
}

function receiving(over: Record<string, unknown>) {
  return {
    id: 701, supplierOrderId: 501, orderNumber: 'MP-261005-000501', status: 'COMPLETED', hasDiscrepancy: true,
    totalAcceptedQuantity: 10, totalReceivedQuantity: 9.5, totalDamagedQuantity: 0, totalMissingQuantity: 0.1,
    instantRefundAmount: 10.5, creditNoteNumber: null, notes: null, receivedAt: '2026-10-05T08:00:00Z',
    items: [receivingItem()], refundStatus: 'APPLIED', ...over,
  };
}

/**
 * 0.1 kg of the weighed 9.6 kg missing at the door: Rs 10.50 (10.00 + 0.50 GST). Billed 9.6, so 9.5 + 0.1 accounts for it
 * (`cardRejectionIsAWithdrawableRefund`). Applied, and no credit note yet: it is issued after this commits.
 */
export const RECEIVING_APPLIED_NO_NOTE_YET = receiving({});

/** The same check-in on a card whose capture has not finished (`rejectionBeforeCaptureIsDeferred`). */
export const RECEIVING_PENDING_CAPTURE = receiving({ refundStatus: 'PENDING_CAPTURE' });

/** With tax invoices on and the note already issued. */
export const RECEIVING_WITH_CREDIT_NOTE = receiving({ creditNoteNumber: 'CN/2627/000001' });

/** Everything arrived: no rejection, no refund, no status. */
export const RECEIVING_IN_FULL = receiving({
  hasDiscrepancy: false, totalReceivedQuantity: 9.6, totalMissingQuantity: 0, instantRefundAmount: 0, refundStatus: null,
  items: [receivingItem({ receivedQuantity: 9.6, missingQuantity: 0, rejectionReason: null, refundAmount: null })],
});

// ── What the restaurant sees before and at checkout (`IntentDtos.IntentResponse`, `OrderPreviewResponse`) ─────

/** A draft of 10 kg of catch-weight chicken at Rs 100 + 5% GST: the SKU descriptor carries `isCatchWeight` (API phase5/api-flags). */
export const INTENT_DRAFT_CATCH_WEIGHT = {
  id: 41, reference: 'REQ-41', outletId: 3, outletName: 'Banjara Hills', restaurantName: 'Paradise', outletLocality: null,
  outletCity: 'Hyderabad', distanceKm: 7.1, supplierStoreId: 12, storeName: 'Fresh Meats store', supplierName: 'Fresh Meats',
  directOrdersEnabled: true, status: 'DRAFT', fulfilment: 'AWAITING', source: 'DIRECT', clonedFromId: null,
  requestedDeliveryTime: null, notes: null, sentAt: null, responseDeadline: null, responseWindowSeconds: 1800,
  acceptedAt: null, orderCreationDeadline: null, orderCreationWindowSeconds: 1800, cancelledAt: null, expiredAt: null,
  createdAt: '2026-10-05T05:00:00Z', serverTime: '2026-10-05T05:00:00Z', editable: true, quantityEditable: true, revision: 1,
  withinOrderWindow: true,
  items: [{
    id: 61, supplierSkuId: 77, canonicalProductId: 55, sku, requestedQuantity: 10, unit: 'KG', notes: null,
    fulfilment: 'AWAITING', offeredQuantity: null, availability: null, unitPrice: null, lineValue: null, lineGst: null,
    lineTotal: null, gstRate: null, supplierNotes: null, agreedUnitPrice: 100, agreedUnitPriceInclusiveGst: 105,
    agreedGstRate: 5, agreedLineValue: 1000, agreedLineGst: 50, agreedLineTotal: 1050, priceChanged: false, previousUnitPrice: null,
  }],
  agreedValue: 1000, agreedGst: 50, agreedTotal: 1050, pricedComplete: true, priceChanged: false, acceptance: null,
  supplierOrderId: null, supplierOrderNumber: null, minOrderValue: null, freeDeliveryThreshold: null,
};

/** The same draft with an ordinary SKU: no disclosure. */
export const INTENT_DRAFT_ORDINARY = {
  ...INTENT_DRAFT_CATCH_WEIGHT,
  items: [{ ...INTENT_DRAFT_CATCH_WEIGHT.items[0], sku: { ...sku, isCatchWeight: false } }],
};

/** `OrderPreviewResponse.PreviewLine` with the flags added in phase5/api-flags. */
export const PREVIEW_LINE_CATCH_WEIGHT = {
  intentItemId: 61, supplierSkuId: 77, productName: 'Chicken', skuName: 'Chicken', offeredQuantity: 10, quantity: 10,
  unit: 'KG', unitPrice: 100, gstRate: 5, lineValue: 1000, lineGst: 50, lineTotal: 1050, isCatchWeight: true, requiresColdChain: false,
};
