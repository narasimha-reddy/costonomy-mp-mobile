/**
 * Whether the supplier should be offered "Request Delivery Partner" for an order.
 *
 * <p>Only for an order sold with Costonomy delivery. A pickup has nothing to deliver, and an order the supplier said
 * they would deliver themselves (free or at their charge) must not get riders: the restaurant was told, and charged,
 * for the supplier's own delivery (API D-145).
 */
export function wantsDeliveryPartner(deliveryMode: string | null | undefined): boolean {
  return deliveryMode === 'COSTONOMY_DELIVERY';
}

const RETRYABLE = new Set(['QUOTE_FAILED', 'PROVIDER_UNAVAILABLE', 'DRIVER_CANCELLED', 'PICKUP_FAILED']);

/**
 * Whether a partner delivery has stopped without a driver, so the supplier can ask for another. A failed quote used
 * to leave the order on "No partner available" with no way forward; the API re-quotes the same delivery on reassign.
 */
export function canRetryPartner(mode: string | null | undefined, status: string | null | undefined): boolean {
  return mode !== 'SUPPLIER_OWN' && status != null && RETRYABLE.has(status);
}
