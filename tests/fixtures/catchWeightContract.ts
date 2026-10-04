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
