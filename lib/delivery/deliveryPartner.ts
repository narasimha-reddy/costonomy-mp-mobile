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

/** `7:34 PM`, built rather than localised so two phones read the same. */
export function clockTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return null;
  const hours = when.getHours();
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour}:${String(when.getMinutes()).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`;
}

/** What the supplier is told while no partner is found, from what the server says (API D-151). */
export function noPartnerNote(
  canSwitchToOwn: boolean | undefined,
  retryUntil: string | null | undefined,
  now: Date = new Date(),
): string {
  if (canSwitchToOwn) {
    return 'We could not find a delivery partner. You can deliver this order yourself; the delivery charge the '
      + 'restaurant paid stays with you.';
  }
  const until = retryUntil ? new Date(retryUntil) : null;
  if (until != null && !Number.isNaN(until.getTime()) && until.getTime() > now.getTime()) {
    return `Still looking for a partner automatically until ${clockTime(retryUntil)}. You can also try again now.`;
  }
  return 'The order stays ready. Try again in a few minutes.';
}
