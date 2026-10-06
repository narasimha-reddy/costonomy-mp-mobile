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

/** The outlet's wallet: the home tile, the wallet screen and add money share it. */
export function walletKey(outletId: number | null | undefined) {
  return ['outlet', outletId, 'wallet'] as const;
}

/**
 * A page-run of the wallet's history under one set of filters. Under `walletKey`, so
 * anything that refreshes the wallet (a top-up, a withdrawal) refreshes this too.
 */
export function walletTransactionsKey(outletId: number | null | undefined, filters: unknown = null) {
  return [...walletTransactionsRootKey(outletId), filters] as const;
}

/** Every history list and filter-options query of an outlet: invalidate this to refresh them all. */
export function walletTransactionsRootKey(outletId: number | null | undefined) {
  return [...walletKey(outletId), 'transactions'] as const;
}

/** One wallet movement's detail. Under `walletKey`, so anything that refreshes the wallet refreshes it. */
export function walletTransactionKey(outletId: number | null | undefined, entryId: string | number | null | undefined) {
  return [...walletKey(outletId), 'transaction', String(entryId)] as const;
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

/** The bill of one wallet movement. Under `walletKey`, so it follows the wallet's refreshes. */
export function walletInvoiceKey(outletId: number | null | undefined, entryId: string | number | null | undefined) {
  return [...walletKey(outletId), 'invoice', String(entryId)] as const;
}

/** A read-only lookup for the bill review pickers. Not under `walletKey`: a wallet refresh need not refetch it. */
export function invoiceLookupKey(
  outletId: number | null | undefined,
  kind: 'suppliers' | 'skus',
  q: string,
  supplierId: number | null = null,
) {
  return ['outlet', outletId, 'invoice-lookups', kind, q, supplierId] as const;
}

/** The supplier store's waiting "Paid direct" claims: the Credit tab's count and the claims inbox share it. */
export function claimsKey(storeId: number | null | undefined) {
  return ['store', storeId, 'credit-claims', 'SUBMITTED'] as const;
}
