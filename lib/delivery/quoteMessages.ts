import { ApiError } from '@/lib/api/errors';

/**
 * What the delivery fee quote and the order that spends it can say (API D-134).
 *
 * <p>For chilled goods the server answers `DELIVERY_UNAVAILABLE` when no carrier is verified to carry them on the
 * route, and `PRICE_CHANGED` when a fee quoted for ordinary goods meets an order that has since become chilled. Both
 * come with a sentence written for the restaurant, so it is shown as sent.
 */

export const DELIVERY_UNAVAILABLE_FALLBACK = "We can't deliver to this address yet";

/** Why our delivery cannot be offered, in the server's words when it gave any. */
export function deliveryUnavailableMessage(caught: unknown): string {
  return caught instanceof ApiError && caught.message ? caught.message : DELIVERY_UNAVAILABLE_FALLBACK;
}

/** A refusal that means the fee the restaurant chose is no longer the right one: ask again, and choose again. */
export function feeNeedsRefreshing(caught: unknown): boolean {
  return caught instanceof ApiError && caught.code === 'PRICE_CHANGED';
}
