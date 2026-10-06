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

/** The supplier store's payouts list for one status and day range (S8). */
export function payoutsKey(
  storeId: number | null | undefined, status: string, from: string | null, to: string | null,
) {
  return ['store', storeId, 'credit-payouts', status, from, to] as const;
}

/** The supplier store's payments feed for one source and day range (S8). */
export function storePaymentsKey(
  storeId: number | null | undefined, source: string | null, from: string | null, to: string | null,
) {
  return ['store', storeId, 'credit-payments', source, from, to] as const;
}

// ── Supplier receivables (M17) ────────────────────────────────────────

/** Every receivables read of a store (home totals, restaurant list, ageing): invalidate this after any credit write. */
export function receivablesRootKey(storeId: number | null | undefined) {
  return ['store', storeId, 'credit', 'receivables'] as const;
}

export function receivablesKey(storeId: number | null | undefined) {
  return [...receivablesRootKey(storeId), 'totals'] as const;
}

/** The restaurant list under one sort, status filter and search; page-runs live in the infinite query. */
export function receivableRestaurantsKey(
  storeId: number | null | undefined, sort: string, status: string | null, q: string,
) {
  return [...receivablesRootKey(storeId), 'restaurants', sort, status, q] as const;
}

export function ageingKey(storeId: number | null | undefined) {
  return [...receivablesRootKey(storeId), 'ageing'] as const;
}

// ── Supplier restaurant detail (M18) ──────────────────────────────────

/** Everything of one credit line. Under the prefix `useDecideClaim` already refreshes after a claim. */
export function agreementKey(agreementId: number) {
  return ['credit-agreement', agreementId] as const;
}

/** The line's waiting "Paid direct" claims. */
export function agreementClaimsKey(agreementId: number) {
  return [...agreementKey(agreementId), 'claims', 'SUBMITTED'] as const;
}

/** Page-runs of the line's payments. */
export function agreementPaymentsKey(agreementId: number) {
  return [...agreementKey(agreementId), 'payments'] as const;
}

/** One line's statement for a range, read by the supplier. */
export function supplierStatementKey(
  storeId: number | null | undefined, agreementId: number, from: string | null, to: string | null,
) {
  return ['store', storeId, 'credit', 'statement', agreementId, from, to] as const;
}

// ── Supplier writes (M19, M25) ────────────────────────────────────────

/** One invoice as the supplier reads it. Not under the line's key: its screen opens before the line is known. */
export function supplierInvoiceKey(invoiceId: number) {
  return ['credit-invoice', invoiceId] as const;
}

/**
 * Everything a supplier write can change: invalidate all of these after recording a payment,
 * moving a due date or closing a line. The store's receivables, restaurant list, ageing and
 * statements (all under `['store', id, 'credit']`), the claims inbox, the payments feed, the
 * agreements list, the line itself (its invoices, payments, claims, previews) and every
 * invoice detail.
 */
export function supplierWriteKeys(storeId: number | null | undefined, agreementId: number | null) {
  return [
    ['store', storeId, 'credit'],
    ['store', storeId, 'credit-claims'],
    ['store', storeId, 'credit-payments'],
    ['store', storeId, 'credit-agreements'],
    ...(agreementId != null ? [agreementKey(agreementId)] : []),
    ['credit-invoice'],
  ] as const;
}
