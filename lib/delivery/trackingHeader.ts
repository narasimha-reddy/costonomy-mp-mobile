import type { OrderTrackingView, TrackingDelivery, TrackingOrder } from '@/lib/delivery/orderTracking';
import { stagesFor } from '@/lib/delivery/orderTracking';
import { haversineM, type LatLng } from '@/lib/delivery/mapGeometry';
import { paymentStatusCopy } from '@/lib/payments/statusLabel';
import type { SupplierOrder } from '@/models/procurement';

/**
 * The buyer's tracking header as one pure function of what `orderTrackingView` already decided, plus the three things
 * it does not know: how fresh the partner's fix is, how far it is from the drop, and the ETA in minutes.
 *
 * <p>No React here. Every string the header shows lives in `COPY` so a copy change is one diff. The provider is never
 * named, and a Costonomy delivery is never described as the supplier delivering it themselves.
 */

/** What the map should draw; mirrors `MapMode` on MandiMap. */
export type MapMode = 'placed' | 'pending' | 'live' | 'arriving' | 'reached';

export type BuyerTrackState = 'draft' | 'placed' | 'preparing' | 'searching' | 'partner_changed' | 'no_partner'
  | 'assigned' | 'at_pickup' | 'on_the_way' | 'arriving' | 'reached' | 'delivered' | 'completed' | 'failed'
  | 'cancelled' | 'own_ready' | 'own_on_the_way' | 'pickup_ready';

export interface BuyerTrackHeader {
  state: BuyerTrackState;
  /** placed = OrderPlacedHero, receipt = the delivered receipt. */
  layout: 'placed' | 'live' | 'receipt';
  tone: 'live' | 'neutral';
  supplierLine: string;
  title: string;
  pill: { text: string; subText: string | null; tone: 'normal' | 'warning' } | null;
  map: MapMode | 'none';
  partner: 'card' | 'placeholder' | 'none';
  /** SearchProgressBar under the placeholder. */
  progress: 'indeterminate' | null;
}

/** Within this of the drop, with a fresh fix, the partner is arriving. */
export const ARRIVING_M = 300;
/** Within this of the drop, with a fresh fix, the partner has reached us. */
export const REACHED_M = 50;
/** Arriving also when the provider says this few minutes or fewer. */
export const ARRIVING_ETA_MINS = 2;

const COPY = {
  supplierFallback: 'Your supplier',
  cancelled: 'Order cancelled',
  draft: 'Payment incomplete',
  draftPill: (supplier: string) => `Pay to send this order to ${supplier}`,
  failed: 'Delivery didn\'t go through',
  failedPill: 'Your supplier and our team have been told.',
  pickupReady: 'Ready to collect',
  pickupPill: (where: string) => `Pick up from ${where}`,
  ownReady: 'Packed and ready',
  ownOnTheWay: 'On the way',
  ownPill: (supplier: string) => `${supplier} is delivering this. No live tracking.`,
  partnerChanged: 'Finding a new delivery partner',
  usually: 'Usually takes 2 to 5 mins',
  partnerChangedHead: 'Your previous partner could not make it',
  partnerChangedBody: 'A new partner is being assigned.',
  noPartner: 'Still arranging delivery',
  noPartnerPill: 'Partners are busy nearby. We\'ll update you here.',
  noPartnerBody: 'Your supplier is on it.',
  searching: 'Assigning a delivery partner',
  searchingHead: (supplier: string) => `Finding a partner near ${supplier}`,
  searchingBody: 'We will show your delivery partner here as soon as one accepts.',
  preparing: 'Packing your order',
  preparingWindow: (slot: string) => `Delivery window ${slot}`,
  preparingSoon: 'We\'ll assign a delivery partner soon',
  preparingHead: 'Assigning delivery partner shortly',
  assigned: (first: string) => `${first} is on the way to the supplier`,
  assignedPill: 'Your order will be picked up shortly',
  atPickup: (first: string) => `${first} is at the supplier`,
  atPickupPill: 'Collecting your order',
  reached: 'Reached your location',
  reachedPill: 'Coming to your doorstep',
  arriving: 'Arriving now',
  arrivingPill: 'Be ready to collect your order',
  onTheWay: 'Order is on the way',
  onTheWayPill: 'On the way',
  late: (mins: number | null) => (mins != null ? `Running late by ${mins} min` : 'Running late'),
  onTime: ' · On time',
  updated: (mins: number) => `Updated ${mins} min ago`,
  waiting: 'Waiting for the partner\'s location',
  partner: 'Your partner',
} as const;

/** The placeholder card's two lines while there is no partner yet; null where the header has no placeholder. */
export function placeholderCopy(state: BuyerTrackState, supplier: string): { title: string; body: string | null } | null {
  switch (state) {
    case 'partner_changed': return { title: COPY.partnerChangedHead, body: COPY.partnerChangedBody };
    case 'no_partner': return { title: COPY.noPartner, body: COPY.noPartnerBody };
    case 'searching': return { title: COPY.searchingHead(supplier), body: COPY.searchingBody };
    case 'preparing': return { title: COPY.preparingHead, body: null };
    default: return null;
  }
}

export type BuyerHeaderOrder = TrackingOrder
  & Partial<Pick<SupplierOrder, 'paymentStatus' | 'paymentInstrument'>>
  & { createdAt?: string; deliverySlotName?: string | null };

type Pill = NonNullable<BuyerTrackHeader['pill']>;
type Kind = 'pickup' | 'own' | 'partner';

/** How this order travels, read off the same step list the view uses (3 pickup, 5 own, 7 Costonomy). */
function kindOf(order: BuyerHeaderOrder, delivery: TrackingDelivery | null): Kind {
  const n = stagesFor(order.deliveryMode, delivery?.mode).length;
  return n === 3 ? 'pickup' : n === 5 ? 'own' : 'partner';
}

function toPoint(loc: { latitude: string | number; longitude: string | number } | null | undefined): LatLng | null {
  if (!loc) return null;
  const latitude = Number(loc.latitude);
  const longitude = Number(loc.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

export function buyerTrackingHeader(i: {
  view: OrderTrackingView;
  order: BuyerHeaderOrder;
  delivery: TrackingDelivery | null;
  drop: LatLng | null;
  nowMs: number;
}): BuyerTrackHeader {
  const { view, order, delivery, drop } = i;
  const supplier = order.supplierName ?? order.storeName ?? COPY.supplierFallback;
  const oStatus = order.status;
  const dStatus = delivery?.status ?? null;
  const kind = kindOf(order, delivery);
  const first = (delivery?.driverName ?? '').trim().split(/\s+/)[0] || COPY.partner;

  const out = (
    state: BuyerTrackState,
    title: string,
    rest: {
      layout?: BuyerTrackHeader['layout']; tone?: BuyerTrackHeader['tone']; pill?: Pill | null;
      map?: BuyerTrackHeader['map']; partner?: BuyerTrackHeader['partner']; progress?: BuyerTrackHeader['progress'];
    } = {},
  ): BuyerTrackHeader => ({
    state,
    layout: rest.layout ?? 'live',
    tone: rest.tone ?? 'live',
    supplierLine: supplier,
    title,
    pill: rest.pill ?? null,
    map: rest.map ?? 'none',
    partner: rest.partner ?? 'none',
    progress: rest.progress ?? null,
  });
  const pill = (text: string, tone: Pill['tone'] = 'normal', subText: string | null = null): Pill =>
    ({ text, subText, tone });
  const neutral = { tone: 'neutral' } as const;

  if (oStatus === 'CANCELLED') {
    const text = order.cancellationReason
      ?? paymentStatusCopy({ status: order.paymentStatus, instrument: order.paymentInstrument, cancelled: true }).label;
    return out('cancelled', COPY.cancelled, { ...neutral, pill: pill(text) });
  }
  if (oStatus === 'DRAFT') {
    return out('draft', COPY.draft, { ...neutral, pill: pill(COPY.draftPill(supplier)) });
  }
  if (oStatus === 'COMPLETED') {
    return out('completed', view.headline, { ...neutral, layout: 'receipt' });
  }
  if (dStatus === 'DELIVERED' || oStatus === 'DELIVERED') {
    return out('delivered', view.headline, { ...neutral, layout: 'receipt' });
  }
  if (dStatus === 'DELIVERY_FAILED') {
    return out('failed', COPY.failed, { ...neutral, pill: pill(COPY.failedPill, 'warning') });
  }
  if (kind === 'pickup' && oStatus === 'READY_FOR_PICKUP') {
    return out('pickup_ready', COPY.pickupReady, { pill: pill(COPY.pickupPill(order.storeName ?? supplier)) });
  }
  if (kind === 'own' && oStatus === 'READY_FOR_PICKUP') {
    return out('own_ready', COPY.ownReady, { pill: pill(COPY.ownPill(supplier)) });
  }
  if (kind === 'own' && oStatus === 'OUT_FOR_DELIVERY') {
    return out('own_on_the_way', COPY.ownOnTheWay, { pill: pill(COPY.ownPill(supplier)) });
  }
  if (oStatus === 'CONFIRMED' && delivery == null) {
    return out('placed', view.headline, { ...neutral, layout: 'placed' });
  }

  // The partner search and its failures: the view already decided which one this is.
  if (view.partnerChanged) {
    return out('partner_changed', COPY.partnerChanged, {
      pill: pill(COPY.usually, 'warning'), map: 'pending', partner: 'placeholder',
    });
  }
  if (view.showFailure || (kind === 'partner' && oStatus === 'READY_FOR_PICKUP' && dStatus === 'CANCELLED')) {
    return out('no_partner', COPY.noPartner, {
      pill: pill(COPY.noPartnerPill, 'warning'), map: 'pending', partner: 'placeholder',
    });
  }
  if (view.searching || (kind === 'partner' && oStatus === 'READY_FOR_PICKUP' && !isPartnerPhase(dStatus))) {
    return out('searching', COPY.searching, {
      pill: pill(COPY.usually), map: 'pending', partner: 'placeholder', progress: 'indeterminate',
    });
  }
  if (oStatus === 'PREPARING' && !isPartnerPhase(dStatus)) {
    const slot = order.deliverySlotName;
    return out('preparing', COPY.preparing, {
      pill: pill(slot ? COPY.preparingWindow(slot) : COPY.preparingSoon),
      map: kind === 'partner' ? 'pending' : 'none',
      partner: kind === 'partner' ? 'placeholder' : 'none',
    });
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
      pill: withSub(etaPill() ?? pill(COPY.assignedPill), 'live'), map: 'live', partner: 'card',
    });
  }
  if (dStatus === 'DRIVER_AT_PICKUP') {
    return out('at_pickup', COPY.atPickup(first), {
      pill: withSub(etaPill() ?? pill(COPY.atPickupPill), 'live'), map: 'live', partner: 'card',
    });
  }

  const driving = dStatus === 'PICKED_UP' || dStatus === 'IN_TRANSIT';
  const fix = delivery != null && delivery.location != null && !delivery.locationStale
    ? toPoint(delivery.location) : null;
  const metres = fix && drop ? haversineM(fix, drop) : null;

  if (dStatus === 'ARRIVED_AT_DESTINATION' || (driving && metres != null && metres <= REACHED_M)) {
    return out('reached', COPY.reached, {
      pill: withSub(pill(COPY.reachedPill), 'reached'), map: 'reached', partner: 'card',
    });
  }
  const eta = delivery?.etaMinutes;
  if (driving && !view.delayed
    && ((metres != null && metres <= ARRIVING_M) || (eta != null && eta <= ARRIVING_ETA_MINS))) {
    return out('arriving', COPY.arriving, {
      pill: withSub(pill(COPY.arrivingPill), 'arriving'), map: 'arriving', partner: 'card',
    });
  }
  if (driving) {
    return out('on_the_way', COPY.onTheWay, {
      pill: withSub(etaPill() ?? pill(COPY.onTheWayPill), 'live'), map: 'live', partner: 'card',
    });
  }

  // Nothing above matched (a status the matrix has no row for): the calm start of the journey.
  return out('placed', view.headline, { ...neutral, layout: 'placed' });
}

const PARTNER_PHASE = new Set(['DRIVER_ASSIGNED', 'DRIVER_AT_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_DESTINATION']);
function isPartnerPhase(status: string | null): boolean {
  return status != null && PARTNER_PHASE.has(status);
}
