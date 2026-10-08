import { canRetryPartner, wantsDeliveryPartner } from '@/lib/delivery/deliveryPartner';

/** How often the supplier's order screen asks for the delivery while none exists yet (auto-dispatch is committing). */
export const FIND_POLL_MS = 2500;
/** After this long with still no delivery the supplier is offered the manual "Request Delivery Partner". */
export const FIND_TIMEOUT_MS = 60000;
const TRACK_POLL_MS = 15000;

export type PartnerAwait = 'finding' | 'manual' | 'none';

/**
 * What the supplier's footer says for a Costonomy-delivery order that is Ready: "Finding a delivery partner…" while
 * the auto-dispatch has not produced a delivery, the manual button only after the timeout. Once a delivery exists the
 * delivery's own status (and the card's Try again) takes over.
 */
export function partnerAwaitPhase(input: {
  orderStatus: string | null | undefined;
  deliveryMode: string | null | undefined;
  hasDelivery: boolean;
  timedOut: boolean;
}): PartnerAwait {
  if (input.orderStatus !== 'READY_FOR_PICKUP' || !wantsDeliveryPartner(input.deliveryMode) || input.hasDelivery) {
    return 'none';
  }
  return input.timedOut ? 'manual' : 'finding';
}

/** The delivery query's refetch interval: fast while empty and expected, the normal follow-along otherwise. */
export function deliveryPollMs(
  found: { mode: string; status: string } | null | undefined,
  awaiting: boolean,
  timedOut: boolean,
): number | false {
  if (found == null) return awaiting ? (timedOut ? TRACK_POLL_MS : FIND_POLL_MS) : false;
  return found.mode !== 'SUPPLIER_OWN'
    && (canRetryPartner(found.mode, found.status) || found.status === 'DELIVERY_REQUESTED'
      || found.status === 'PROVIDER_SELECTED') ? TRACK_POLL_MS : false;
}
