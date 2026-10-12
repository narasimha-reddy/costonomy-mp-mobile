import { partnerWording } from '@/lib/delivery/partnerWording';
import { partyTitle } from '@/lib/supplier/partyTitle';
import { haversineM } from '@/lib/delivery/mapGeometry';
import type { LatLng } from '@/lib/delivery/mapGeometry';
import type { OrderTrackingView, TrackingDelivery, TrackingOrder } from '@/lib/delivery/orderTracking';
import {
  ARRIVING_ETA_MINS, ARRIVING_M, REACHED_M, isPartnerPhase, kindOf, toPoint,
  type BuyerTrackHeader, type BuyerTrackState, type MapMode,
} from '@/lib/delivery/trackingHeader';

/**
 * The supplier's tracking header: the same shape and the same states as the restaurant's `buyerTrackingHeader`, with
 * copy that speaks to the supplier ("Waiting for a delivery partner for {restaurant}", "Order collected, on the way to
 * {restaurant}"). Pure; no React. The provider is never named, and the partner area is left to the supplier's own
 * search panel while a partner is being found (it carries the retry and switch-to-own controls).
 *
 * <p>The supplier's route has no outlet context, so the map is only drawn before pickup when the server has sent the
 * drop coordinates; the live states draw regardless, as the restaurant's do.
 */
const COPY = {
  restaurantFallback: 'The restaurant',
  cancelled: 'Order cancelled',
  draft: 'Awaiting payment',
  draftPill: 'The restaurant has not completed payment yet.',
  failed: 'Delivery failed',
  pickupReady: 'Waiting for collection',
  pickupPill: 'The restaurant will collect it from your store.',
  ownReady: 'Ready to send',
  ownReadyPill: 'Dispatch it when it leaves your store.',
  ownOnTheWay: 'Out for delivery',
  ownOnTheWayPill: 'Mark it delivered once it arrives.',
  preparing: 'Pack the order',
  preparingPill: 'Mark it ready once it is packed',
  searching: (restaurant: string) => `Waiting for a delivery partner for ${restaurant}`,
  noPartner: 'No partner found yet',
  noPartnerPill: 'We could not find a delivery partner.',
  assigned: (first: string) => `${first} is on the way to collect`,
  assignedPill: (orderNumber: string) => `Keep order ${orderNumber} at the counter`,
  atPickup: (first: string) => `${first} is at your store`,
  atPickupPill: (orderNumber: string) => `Hand over order ${orderNumber}`,
  onTheWay: (restaurant: string) => `Order collected, on the way to ${restaurant}`,
  onTheWayPill: 'On the way',
  arriving: (restaurant: string) => `Arriving at ${restaurant} now`,
  arrivingPill: (first: string) => `${first} is almost there`,
  reached: (first: string, restaurant: string) => `${first} has reached ${restaurant}`,
  reachedPill: 'Waiting for the restaurant to receive it',
  late: (mins: number | null) => (mins != null ? `Running late by ${mins} min` : 'Running late'),
  onTime: ' · On time',
  updated: (mins: number) => `Updated ${mins} min ago`,
  waiting: 'Waiting for the partner\'s location',
  partner: 'The partner',
} as const;

/** TrackingOrder (owned by orderTracking.ts) plus the restaurant's own name, which the supplier's DTO carries. */
type SupplierTrackingOrder = TrackingOrder & { createdAt?: string; restaurantName?: string | null };

type Pill = NonNullable<BuyerTrackHeader['pill']>;

export function supplierTrackingHeader(i: {
  view: OrderTrackingView;
  order: SupplierTrackingOrder;
  delivery: TrackingDelivery | null;
  drop: LatLng | null;
  nowMs: number;
}): BuyerTrackHeader {
  const { view, order, delivery, drop } = i;
  // Who it is for: the restaurant's name and its outlet (a restaurant can have several), whichever the DTO carries.
  const restaurant = partyTitle(order.restaurantName, order.outletName, COPY.restaurantFallback);
  const oStatus = order.status;
  const dStatus = delivery?.status ?? null;
  const kind = kindOf(order, delivery);
  const first = (delivery?.driverName ?? '').trim().split(/\s+/)[0] || COPY.partner;
  const orderNumber = order.orderNumber ?? 'the order';

  const out = (
    state: BuyerTrackState,
    title: string,
    rest: {
      layout?: BuyerTrackHeader['layout']; tone?: BuyerTrackHeader['tone']; pill?: Pill | null;
      map?: BuyerTrackHeader['map']; partner?: BuyerTrackHeader['partner'];
    } = {},
  ): BuyerTrackHeader => ({
    state,
    layout: rest.layout ?? 'live',
    tone: rest.tone ?? 'live',
    supplierLine: restaurant,
    title,
    pill: rest.pill ?? null,
    map: rest.map ?? 'none',
    partner: rest.partner ?? 'none',
    progress: null,
  });
  const pill = (text: string | null | undefined, tone: Pill['tone'] = 'normal', subText: string | null = null): Pill | null =>
    (text ? { text, subText, tone } : null);
  const neutral = { tone: 'neutral' } as const;
  // Before pickup the map shows pickup and drop; with no drop known there is nothing to centre on.
  const pending: BuyerTrackHeader['map'] = drop != null ? 'pending' : 'none';

  if (oStatus === 'CANCELLED') {
    return out('cancelled', COPY.cancelled, { ...neutral, pill: pill(order.cancellationReason) });
  }
  if (oStatus === 'DRAFT') {
    return out('draft', COPY.draft, { ...neutral, pill: pill(COPY.draftPill) });
  }
  if (oStatus === 'COMPLETED') {
    return out('completed', view.headline, { ...neutral, layout: 'receipt' });
  }
  if (dStatus === 'DELIVERED' || oStatus === 'DELIVERED') {
    return out('delivered', view.headline, { ...neutral, layout: 'receipt' });
  }
  if (dStatus === 'DELIVERY_FAILED') {
    return out('failed', COPY.failed, { ...neutral, pill: pill(delivery?.failureReason ? partnerWording(delivery.failureReason) : delivery?.failureReason, 'warning') });
  }
  if (kind === 'pickup' && oStatus === 'READY_FOR_PICKUP') {
    return out('pickup_ready', COPY.pickupReady, { pill: pill(COPY.pickupPill) });
  }
  if (kind === 'own' && oStatus === 'READY_FOR_PICKUP') {
    return out('own_ready', COPY.ownReady, { pill: pill(COPY.ownReadyPill) });
  }
  if (kind === 'own' && oStatus === 'OUT_FOR_DELIVERY') {
    return out('own_on_the_way', COPY.ownOnTheWay, { pill: pill(COPY.ownOnTheWayPill) });
  }
  if (oStatus === 'CONFIRMED' && delivery == null) {
    return out('placed', view.headline, { ...neutral, layout: 'placed' });
  }

  // The partner search and its failures: the view already decided which one this is.
  if (view.showFailure || (kind === 'partner' && oStatus === 'READY_FOR_PICKUP' && dStatus === 'CANCELLED')) {
    const text = dStatus === 'CANCELLED' ? view.subline : (delivery?.failureReason ? partnerWording(delivery.failureReason) : null) ?? COPY.noPartnerPill;
    return out('no_partner', dStatus === 'CANCELLED' ? view.headline : COPY.noPartner, {
      pill: pill(text, 'warning'), map: pending,
    });
  }
  if (view.searching || (kind === 'partner' && oStatus === 'READY_FOR_PICKUP' && !isPartnerPhase(dStatus))) {
    // No delivery row yet means the partner has not been requested: say what the supplier does next.
    return out('searching', delivery == null ? view.headline : COPY.searching(restaurant), {
      pill: pill(view.subline), map: delivery == null ? 'none' : pending,
    });
  }
  if (oStatus === 'PREPARING' && !isPartnerPhase(dStatus)) {
    return out('preparing', COPY.preparing, { pill: pill(COPY.preparingPill) });
  }

  // From here a partner is on the job.
  const etaPill = (): Pill | null => {
    if (view.delayed) return pill(COPY.late(view.lateMinutes), 'warning');
    if (view.etaText) return pill(`${view.etaText}${view.tag?.kind === 'on_time' ? COPY.onTime : ''}`);
    return null;
  };
  const withSub = (p: Pill | null, mode: MapMode): Pill | null => {
    if (!p) return null;
    const live = mode === 'live' || mode === 'arriving' || mode === 'reached';
    let subText: string | null = null;
    if (live && delivery?.locationStale) {
      subText = COPY.updated(Math.max(1, Math.round((delivery.locationAgeSeconds ?? 0) / 60)));
    } else if (mode === 'live' && delivery?.location == null) {
      subText = COPY.waiting;
    }
    return { ...p, subText };
  };

  if (dStatus === 'DRIVER_ASSIGNED') {
    return out('assigned', COPY.assigned(first), {
      pill: withSub(etaPill() ?? pill(COPY.assignedPill(orderNumber)), 'live'), map: 'live', partner: 'card',
    });
  }
  if (dStatus === 'DRIVER_AT_PICKUP') {
    return out('at_pickup', COPY.atPickup(first), {
      pill: withSub(etaPill() ?? pill(COPY.atPickupPill(orderNumber)), 'live'), map: 'live', partner: 'card',
    });
  }

  const driving = dStatus === 'PICKED_UP' || dStatus === 'IN_TRANSIT';
  const fix = delivery != null && delivery.location != null && !delivery.locationStale
    ? toPoint(delivery.location) : null;
  const metres = fix && drop ? haversineM(fix, drop) : null;

  if (dStatus === 'ARRIVED_AT_DESTINATION' || (driving && metres != null && metres <= REACHED_M)) {
    return out('reached', COPY.reached(first, restaurant), {
      pill: withSub(pill(COPY.reachedPill), 'reached'), map: 'reached', partner: 'card',
    });
  }
  const eta = delivery?.etaMinutes;
  if (driving && !view.delayed
    && ((metres != null && metres <= ARRIVING_M) || (eta != null && eta <= ARRIVING_ETA_MINS))) {
    return out('arriving', COPY.arriving(restaurant), {
      pill: withSub(pill(COPY.arrivingPill(first)), 'arriving'), map: 'arriving', partner: 'card',
    });
  }
  if (driving) {
    return out('on_the_way', COPY.onTheWay(restaurant), {
      pill: withSub(etaPill() ?? pill(COPY.onTheWayPill), 'live'), map: 'live', partner: 'card',
    });
  }

  // Nothing above matched: the calm start of the journey.
  return out('placed', view.headline, { ...neutral, layout: 'placed' });
}
