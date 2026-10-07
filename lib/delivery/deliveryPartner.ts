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

export interface SearchProgress {
  /** 0 to 1, or null when there is no span to measure (an indeterminate bar). */
  fraction: number | null;
  minutesElapsed: number | null;
  minutesTotal: number | null;
  /** The search window has passed; the supplier is offered delivering it themselves. */
  finished: boolean;
}

/**
 * How far through the automatic search for a partner we are, from the server's start and end times. The bar fills to
 * the end of the window and stops there; it never claims a partner was found (API D-151).
 */
export function searchProgress(
  searchStartedAt: string | null | undefined,
  retryUntil: string | null | undefined,
  now: Date = new Date(),
): SearchProgress {
  const start = searchStartedAt ? new Date(searchStartedAt).getTime() : NaN;
  const end = retryUntil ? new Date(retryUntil).getTime() : NaN;
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    return { fraction: null, minutesElapsed: null, minutesTotal: null, finished: false };
  }
  const elapsed = Math.max(0, now.getTime() - start);
  const total = end - start;
  return {
    fraction: Math.min(1, elapsed / total),
    minutesElapsed: Math.min(Math.round(total / 60000), Math.floor(elapsed / 60000)),
    minutesTotal: Math.round(total / 60000),
    finished: now.getTime() >= end,
  };
}
