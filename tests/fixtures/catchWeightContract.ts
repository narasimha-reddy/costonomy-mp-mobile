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
