/**
 * Query keys shared by more than one screen.
 *
 * <p>A key used in two places has to be spelled identically in both or the cache
 * silently splits in two — the cart screen updating one entry while the header
 * badge reads another. Keys local to a single screen stay in that screen.
 */
export function cartKey(outletId: number | null) {
  return ['outlet', outletId, 'cart'] as const;
}

/** Where checkout leaves its submit response for the payment screen to pay. */
export function submitKey(procurementId: number) {
  return ['procurement', procurementId, 'submit'] as const;
}

export function procurementKey(procurementId: number) {
  return ['procurement', procurementId] as const;
}

// ── Requests ──────────────────────────────────────────────────────────

/**
 * The outlet's unsent requests — what used to be the cart.
 *
 * <p>Separate from {@link cartKey} rather than replacing it, because the two
 * coexist while orders placed the old way are still in flight.
 */
export function draftsKey(outletId: number | null) {
  return ['outlet', outletId, 'intent-drafts'] as const;
}

export function intentsKey(outletId: number | null) {
  return ['outlet', outletId, 'intents'] as const;
}

export function intentKey(intentId: number) {
  return ['intent', intentId] as const;
}

export function storeIntentsKey(storeId: number | null) {
  return ['supplier-store', storeId, 'intents'] as const;
}

/**
 * Where the request screen leaves a new order's payment intent for the pay
 * screen to use.
 *
 * <p>Cached rather than re-fetched: the provider order id is minted once, when
 * the order is created, and asking again would mean arranging funding twice.
 */
export function orderPaymentKey(supplierOrderId: number) {
  return ['supplier-order', supplierOrderId, 'payment-intent'] as const;
}
