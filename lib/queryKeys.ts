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
