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
