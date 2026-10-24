import type { Delivery, DeliveryStatus } from '@/models/delivery';
import type { DeliveryMode as OrderDeliveryMode, SupplierOrder, SupplierOrderStatus } from '@/models/procurement';
import { canRetryPartner, clockTime, searchProgress } from '@/lib/delivery/deliveryPartner';
import { partnerWording } from '@/lib/delivery/partnerWording';

/**
 * What the order tracker shows, as one pure function of what the server said.
 *
 * <p>Nothing here advances a step because of a tap: the current step is the higher of the order's status and the
 * delivery's status, both read from the API. All the words live in this file so a copy change is one diff and the
 * table-driven test can pin every state for both audiences.
 */

export type Audience = 'buyer' | 'supplier';
export type StepKey = 'confirmed' | 'preparing' | 'ready' | 'partner' | 'picked_up' | 'on_the_way' | 'delivered';
export type TrackerTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export type TrackerProblem = 'warning' | 'danger' | null;

export interface TrackerStep {
  key: StepKey;
  /** Short, for under a dot. */
  label: string;
  /** For screen readers and the vertical list; defaults to `label`. */
  longLabel: string;
}

const STEP: Record<StepKey, TrackerStep> = {
  confirmed: { key: 'confirmed', label: 'Confirmed', longLabel: 'Confirmed' },
  preparing: { key: 'preparing', label: 'Preparing', longLabel: 'Preparing' },
  ready: { key: 'ready', label: 'Ready', longLabel: 'Ready' },
  partner: { key: 'partner', label: 'Partner', longLabel: 'Partner assigned' },
  picked_up: { key: 'picked_up', label: 'Picked up', longLabel: 'Picked up' },
  on_the_way: { key: 'on_the_way', label: 'On the way', longLabel: 'On the way' },
  delivered: { key: 'delivered', label: 'Delivered', longLabel: 'Delivered' },
};

const COSTONOMY_STEPS: StepKey[] = ['confirmed', 'preparing', 'ready', 'partner', 'picked_up', 'on_the_way', 'delivered'];
const OWN_STEPS: StepKey[] = ['confirmed', 'preparing', 'ready', 'on_the_way', 'delivered'];

/** Position of each step on the full seven-step journey; the other lists are subsets of it. */
const RANK: Record<StepKey, number> = {
  confirmed: 0, preparing: 1, ready: 2, partner: 3, picked_up: 4, on_the_way: 5, delivered: 6,
};

const PARTNER_PHASE: ReadonlySet<string> = new Set([
  'DRIVER_ASSIGNED', 'DRIVER_AT_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_DESTINATION',
]);
const SEARCHING: ReadonlySet<string> = new Set(['DELIVERY_REQUESTED', 'QUOTE_RECEIVED', 'PROVIDER_SELECTED']);

const ORDER_RANK: Partial<Record<SupplierOrderStatus, number>> = {
  CONFIRMED: 0, PREPARING: 1, READY_FOR_PICKUP: 2, OUT_FOR_DELIVERY: 5, DELIVERED: 6, COMPLETED: 6,
};
const DELIVERY_RANK: Partial<Record<DeliveryStatus, number>> = {
  DELIVERY_REQUESTED: 2, QUOTE_RECEIVED: 2, PROVIDER_SELECTED: 2,
  QUOTE_FAILED: 2, PROVIDER_UNAVAILABLE: 2, DRIVER_CANCELLED: 2, PICKUP_FAILED: 2,
  DRIVER_ASSIGNED: 3, DRIVER_AT_PICKUP: 3, PICKED_UP: 4, IN_TRANSIT: 5, ARRIVED_AT_DESTINATION: 5, DELIVERED: 6,
};

type TravelKind = 'pickup' | 'own' | 'partner';

function travelKind(orderMode: string | null | undefined, deliveryMode: string | null | undefined): TravelKind {
  if (orderMode === 'PICKUP') return 'pickup';
  if (orderMode === 'SUPPLIER_DELIVERY' || deliveryMode === 'SUPPLIER_OWN') return 'own';
  return 'partner';
}

/** The steps for how this order travels. Pickup has 3, supplier delivery 5, Costonomy delivery 7. */
export function stagesFor(
  orderMode: OrderDeliveryMode | string | null | undefined,
  deliveryMode?: string | null,
): TrackerStep[] {
  const kind = travelKind(orderMode, deliveryMode);
  if (kind === 'pickup') {
    return [STEP.confirmed, STEP.preparing, { key: 'ready', label: 'Ready', longLabel: 'Ready to collect' }];
  }
  return (kind === 'own' ? OWN_STEPS : COSTONOMY_STEPS).map((key) => STEP[key]);
}

/**
 * The step on the full seven-step journey (0 to 6) that the server's statuses put us on: the higher of the two. -1
 * when neither says anything, which is a DRAFT or CANCELLED order with no delivery progress.
 */
export function stageIndex(
  orderStatus: SupplierOrderStatus | string | null | undefined,
  deliveryStatus: DeliveryStatus | string | null | undefined,
): number {
  const fromOrder = ORDER_RANK[orderStatus as SupplierOrderStatus] ?? -1;
  const fromDelivery = DELIVERY_RANK[deliveryStatus as DeliveryStatus] ?? -1;
  return Math.max(fromOrder, fromDelivery);
}

export interface EtaCopy {
  text: string | null;
  overdue: boolean;
}

/**
 * "Arriving in 12 mins", or that the estimate has passed. `nowMs` is the server-corrected clock (`serverNow()` from
 * lib/server-clock), passed in so this stays pure; the arithmetic is the same as `secondsUntil`. Falls back to the
 * provider's `etaMinutes` when there is no arrival time.
 */
export function etaCopy(
  estimatedArrivalAt: string | null | undefined,
  etaMinutes: number | null | undefined,
  nowMs: number,
): EtaCopy {
  const at = estimatedArrivalAt ? Date.parse(estimatedArrivalAt) : NaN;
  if (Number.isFinite(at)) {
    const seconds = Math.ceil((at - nowMs) / 1000);
    if (seconds <= 0) return { text: 'Running a little late', overdue: true };
    return { text: minutesAway(Math.ceil(seconds / 60)), overdue: false };
  }
  if (etaMinutes != null && etaMinutes > 0) return { text: minutesAway(etaMinutes), overdue: false };
  return { text: null, overdue: false };
}

function minutesAway(minutes: number): string {
  return `Arriving in ${minutes} ${minutes === 1 ? 'min' : 'mins'}`;
}

/** Up to two initials, for an avatar. Never throws on an empty name. */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const letter = (word: string | undefined) => Array.from(word ?? '')[0] ?? '';
  const last = parts.length > 1 ? letter(parts[parts.length - 1]) : '';
  return (letter(parts[0]) + last).toUpperCase();
}

/** The slice of an order the tracker reads. A full `SupplierOrder` satisfies it. */
export type TrackingOrder = Pick<SupplierOrder, 'status' | 'deliveryMode'>
  & Partial<Pick<SupplierOrder, 'orderNumber' | 'supplierName' | 'storeName' | 'outletName' | 'restaurantName' | 'cancellationReason'>>;

export type TrackingDelivery = Pick<Delivery, 'status' | 'mode'> & Partial<Omit<Delivery, 'status' | 'mode'>>;

export type TrackerTagKind = 'on_time' | 'late' | 'searching' | 'delivered';
export interface TrackerTag {
  kind: TrackerTagKind;
  /** Sentence case; the screen draws it in capitals. */
  label: string;
}
export interface TrackerBanner {
  title: string;
  body: string;
}
/** What the top of the screen illustrates while there is no live map. */
export type TrackerStage = 'bag' | 'cube' | 'bicycle' | 'done';

/**
 * The five (or three) segments of the progress bar.
 *
 * <p>A Costonomy delivery reads Placed, Packing, Partner, On the way, Delivered. A supplier's own van and a collection
 * have no partner, so their third segment is Ready, and a collection stops there.
 */
const SEGMENTS: Record<TravelKind, string[]> = {
  partner: ['Placed', 'Packing', 'Partner', 'On the way', 'Delivered'],
  own: ['Placed', 'Packing', 'Ready', 'On the way', 'Delivered'],
  pickup: ['Placed', 'Packing', 'Ready'],
};
/** Which segment each position on the full seven-step journey lands in. */
const SEGMENT_OF_RANK: Record<TravelKind, number[]> = {
  partner: [0, 1, 2, 2, 3, 3, 4],
  own: [0, 1, 2, 2, 3, 3, 4],
  pickup: [0, 1, 2, 2, 2, 2, 2],
};

export interface OrderTrackingView {
  /** The small line above the headline: who the other party is. */
  party: string | null;
  /** The five-segment progress bar; empty when the order has no journey to show. */
  segments: string[];
  /** Index into `segments` of the current one; -1 when there is none. */
  segmentIndex: number;
  /** How full the current segment is drawn, 0 to 1. Presentation only. */
  segmentFill: number;
  /** "Step 4 of 5 · On the way". */
  stepLine: string | null;
  /** "Next: Delivered", or "Complete". */
  nextLine: string | null;
  /** The small text after a big headline: "by 7:48 PM". */
  etaSmall: string | null;
  tag: TrackerTag | null;
  /** The server's estimate has passed. */
  delayed: boolean;
  lateMinutes: number | null;
  /** The previous partner fell through and another is being found (buyer only). */
  partnerChanged: boolean;
  banner: TrackerBanner | null;
  stage: TrackerStage;
  /** The top of the screen: a map once a partner is reported, a success band when delivered, else an illustration. */
  top: 'illustration' | 'map' | 'success';
  /** True while we are looking for a partner: pulse rings, shimmer. */
  searching: boolean;
  steps: TrackerStep[];
  /** Index into `steps`; -1 when the stepper is hidden. */
  currentIndex: number;
  complete: boolean;
  problem: TrackerProblem;
  tone: TrackerTone;
  headline: string;
  subline: string | null;
  etaText: string | null;
  search: 'indeterminate' | 'determinate' | null;
  showFailure: boolean;
  showPartner: boolean;
  showCall: boolean;
  showMap: boolean;
  showTrack: boolean;
  showReceive: boolean;
  terminal: boolean;
}

interface Copy {
  headline: string;
  subline: string | null;
  tone?: TrackerTone;
}

export function orderTrackingView(input: {
  audience: Audience;
  order: TrackingOrder;
  delivery: TrackingDelivery | null | undefined;
  nowMs: number;
}): OrderTrackingView {
  const { audience, order, delivery, nowMs } = input;
  const buyer = audience === 'buyer';
  const oStatus = order.status;
  const dStatus = delivery?.status ?? null;
  const kind = travelKind(order.deliveryMode, delivery?.mode);

  const supplier = order.supplierName ?? order.storeName ?? 'Your supplier';
  // The supplier knows the restaurant by its name; the outlet locality ("Indiranagar") is only a fallback.
  const outlet = (buyer ? order.outletName : order.restaurantName ?? order.outletName) ?? (buyer ? 'your outlet' : 'the restaurant');
  const partnerName = delivery?.driverName ?? (buyer ? 'Your partner' : 'The partner');
  const orderNumber = order.orderNumber ?? 'the order';

  const base: OrderTrackingView = {
    party: buyer ? supplier : order.restaurantName ?? order.outletName ?? null,
    segments: [], segmentIndex: -1, segmentFill: 0, stepLine: null, nextLine: null, etaSmall: null, tag: null,
    delayed: false, lateMinutes: null, partnerChanged: false, banner: null, stage: 'bag', top: 'illustration',
    searching: false,
    steps: [], currentIndex: -1, complete: false, problem: null, tone: 'neutral', headline: '', subline: null,
    etaText: null, search: null, showFailure: false, showPartner: false, showCall: false, showMap: false,
    showTrack: false, showReceive: false, terminal: false,
  };

  // No stepper for an order that never started or has ended without delivery.
  if (oStatus === 'CANCELLED') {
    return {
      ...base, tone: 'danger', terminal: true, headline: 'Order cancelled', subline: order.cancellationReason ?? null,
    };
  }
  if (oStatus === 'DRAFT') {
    return {
      ...base,
      headline: buyer ? 'Payment incomplete' : 'Awaiting payment',
      subline: buyer ? `Pay to send this order to ${supplier}.` : 'The restaurant has not completed payment yet.',
    };
  }

  const steps = stagesFor(order.deliveryMode, delivery?.mode);
  const canonical = stageIndex(oStatus, dStatus);

  const delivered = dStatus === 'DELIVERED' || oStatus === 'DELIVERED';
  const completed = oStatus === 'COMPLETED';
  const failed = dStatus === 'DELIVERY_FAILED';
  const retryable = canRetryPartner(delivery?.mode, dStatus);
  // A supplier delivering it themselves has a delivery row too (the supplier is the "driver"), but no partner to
  // introduce, no ETA to promise and no map: those are Costonomy-delivery things.
  const partnerPhase = kind !== 'own' && dStatus != null && PARTNER_PHASE.has(dStatus);
  const searching = dStatus != null && SEARCHING.has(dStatus);
  // The partner fell through after being found. The restaurant is told calmly; the supplier sees the usual stop.
  const partnerChanged = buyer && (dStatus === 'DRIVER_CANCELLED' || dStatus === 'PICKUP_FAILED');

  let canonicalIndex = canonical;
  if (failed) {
    // Stays on the last step reached.
    const reached = delivery?.pickedUpAt ? 4 : delivery?.driverName ? 3 : 2;
    canonicalIndex = Math.max(canonical, reached);
  }
  const currentIndex = (delivered || completed)
    ? steps.length - 1
    : indexInSteps(steps, canonicalIndex);
  const complete = delivered || completed;

  const eta = partnerPhase && dStatus !== 'ARRIVED_AT_DESTINATION'
    ? etaCopy(delivery?.estimatedArrivalAt, delivery?.etaMinutes, nowMs)
    : { text: null, overdue: false };
  const overdue = eta.overdue && !complete && !failed;
  const arrivalMs = delivery?.estimatedArrivalAt ? Date.parse(delivery.estimatedArrivalAt) : NaN;
  const lateMinutes = overdue && Number.isFinite(arrivalMs) ? Math.max(1, Math.ceil((nowMs - arrivalMs) / 60000)) : null;

  let copy: Copy;
  let search: OrderTrackingView['search'] = null;
  let banner: TrackerBanner | null = null;

  if (completed) {
    copy = buyer
      ? { headline: 'Order completed', subline: 'Checked in. Report an issue if something is not right.', tone: 'success' }
      : { headline: 'Completed', subline: 'Checked in by the restaurant.', tone: 'success' };
  } else if (delivered) {
    const at = clockTime(delivery?.deliveredAt);
    copy = buyer
      ? {
        headline: at ? `Delivered at ${at}` : 'Delivered',
        subline: 'Check the goods in to close the order',
        tone: 'success',
      }
      : {
        headline: at ? `Delivered at ${at}` : 'Delivered',
        subline: 'Waiting for the restaurant to check it in',
        tone: 'success',
      };
  } else if (failed) {
    copy = buyer
      ? { headline: 'Delivery didn\'t go through', subline: 'Your supplier and our team have been told.', tone: 'danger' }
      : { headline: 'Delivery failed', subline: delivery?.failureReason ? partnerWording(delivery.failureReason) : null, tone: 'danger' };
  } else if (partnerChanged) {
    search = 'indeterminate';
    copy = { headline: 'Finding a new delivery partner', subline: 'Usually takes 2 to 5 mins', tone: 'warning' };
    banner = {
      title: 'Partner changed',
      body: 'Your previous partner could not complete the pickup. A new partner is being assigned.',
    };
  } else if (retryable) {
    copy = buyer
      ? {
        headline: 'Still arranging delivery',
        subline: 'Partners are busy nearby. Your supplier is on it; we\'ll update you here.',
        tone: 'warning',
      }
      : {
        headline: 'No partner found yet',
        subline: (delivery?.failureReason ? partnerWording(delivery.failureReason) : null) ?? 'We could not find a delivery partner.',
        tone: 'warning',
      };
  } else if (dStatus != null && partnerPhase) {
    copy = partnerCopy({ buyer, dStatus, eta, name: partnerName, outlet, orderNumber, delivery, overdue });
    if (overdue) {
      banner = {
        title: 'Delayed',
        body: 'The delivery is taking longer than expected. We will keep this page updated.',
      };
    }
  } else if (searching) {
    search = buyer ? 'indeterminate' : 'determinate';
    const progress = searchProgress(delivery?.searchStartedAt, delivery?.retryUntil, new Date(nowMs));
    copy = buyer
      ? { headline: 'Finding a delivery partner', subline: 'Usually takes 2 to 5 mins', tone: 'info' }
      : {
        headline: 'Finding a delivery partner',
        subline: progress.minutesElapsed != null && progress.minutesTotal != null
          ? `Searching… ${progress.minutesElapsed} of ${progress.minutesTotal} min. We keep looking automatically.`
          : 'We\'re looking for a partner near your store.',
        tone: 'info',
      };
  } else {
    copy = orderCopy({ buyer, kind, oStatus, supplier, order, dStatus });
    if (kind === 'partner' && oStatus === 'READY_FOR_PICKUP' && buyer) search = 'indeterminate';
  }

  const problem: TrackerProblem = failed ? 'danger' : retryable ? 'warning' : null;
  const showTrack = !!delivery?.trackable && partnerPhase;
  const showPartner = !!delivery?.driverName && partnerPhase;
  const showReceive = buyer && !completed
    && (oStatus === 'DELIVERED' || dStatus === 'DELIVERED'
      || (kind === 'pickup' && oStatus === 'READY_FOR_PICKUP'));
  const showMap = showTrack && delivery?.location != null;
  const isSearching = search != null;

  // The five-segment bar. A failed delivery stays on the last segment it reached.
  const segments = SEGMENTS[kind];
  const rank = Math.max(0, Math.min(6, canonicalIndex));
  const segmentIndex = complete && kind !== 'pickup' ? segments.length - 1 : SEGMENT_OF_RANK[kind][rank] ?? 0;
  const atEnd = segmentIndex >= segments.length - 1;
  // A finished collection has gone past Ready: the restaurant has the goods.
  const stepName = complete && kind === 'pickup' ? 'Collected' : segments[segmentIndex];
  const stepLine = `Step ${segmentIndex + 1} of ${segments.length} · ${stepName}`;
  const nextLine = complete && atEnd ? 'Complete' : atEnd ? null : `Next: ${segments[segmentIndex + 1]}`;

  let tag: TrackerTag | null = null;
  if (complete && kind !== 'pickup') tag = { kind: 'delivered', label: 'Delivered' };
  else if (overdue) tag = { kind: 'late', label: lateMinutes != null ? `Late by ${lateMinutes} min` : 'Late' };
  else if (isSearching) tag = { kind: 'searching', label: 'Searching' };
  else if (partnerPhase && !failed && !retryable) tag = { kind: 'on_time', label: 'On time' };

  // Only a stated arrival time is repeated small; a bare minutes figure has no clock time to show.
  const arrivalClock = clockTime(delivery?.estimatedArrivalAt);
  let etaSmall: string | null = null;
  if (overdue) etaSmall = arrivalClock ? `was due by ${arrivalClock}` : null;
  else if (eta.text != null && buyer && arrivalClock) etaSmall = `by ${arrivalClock}`;
  else if (eta.text != null && !buyer) etaSmall = eta.text.replace('Arriving in', 'arrives in');

  let stage: TrackerStage = 'bag';
  if (complete && kind !== 'pickup') stage = 'done';
  else if (isSearching || retryable || partnerPhase || (oStatus === 'OUT_FOR_DELIVERY' && kind !== 'pickup')) stage = 'bicycle';
  else if (segmentIndex >= 1) stage = 'cube';

  return {
    party: base.party,
    segments,
    segmentIndex,
    segmentFill: isSearching ? 1 : dStatus === 'ARRIVED_AT_DESTINATION' ? 0.92 : 0.5,
    stepLine,
    nextLine,
    etaSmall,
    tag,
    delayed: overdue,
    lateMinutes,
    partnerChanged,
    banner,
    stage,
    top: complete && kind !== 'pickup' ? 'success' : showTrack ? 'map' : 'illustration',
    searching: isSearching,
    steps,
    currentIndex,
    complete,
    problem,
    tone: overdue ? 'warning' : copy.tone ?? 'info',
    headline: copy.headline,
    subline: copy.subline,
    etaText: eta.text,
    search,
    showFailure: failed || retryable,
    showPartner,
    showCall: showPartner && !!delivery?.driverPhone,
    showMap,
    showTrack,
    showReceive,
    terminal: complete || failed,
  };
}

/** Map an index on the seven-step journey onto a shorter list: the highest step that is not past it. */
function indexInSteps(steps: TrackerStep[], canonicalIndex: number): number {
  if (canonicalIndex < 0) return 0;
  let found = 0;
  steps.forEach((step, i) => {
    if (RANK[step.key] <= canonicalIndex && step.key !== 'delivered') found = i;
  });
  return found;
}

function partnerCopy(a: {
  buyer: boolean;
  dStatus: DeliveryStatus;
  eta: EtaCopy;
  name: string;
  outlet: string;
  orderNumber: string;
  delivery: TrackingDelivery | null | undefined;
  overdue: boolean;
}): Copy {
  const { buyer, dStatus, eta, name, outlet, orderNumber, overdue } = a;
  const first = name.split(/\s+/)[0] || name;
  if (overdue) {
    return {
      headline: 'Running late',
      subline: buyer ? `${first} is still on the way` : `${first} is still on the way to ${outlet}`,
      tone: 'warning',
    };
  }
  switch (dStatus) {
    case 'DRIVER_ASSIGNED':
      return buyer
        ? { headline: `${first} is heading to the supplier`, subline: 'Your order will be picked up shortly' }
        : { headline: 'Partner on the way to you', subline: `Keep order ${orderNumber} at the counter.` };
    case 'DRIVER_AT_PICKUP':
      return buyer
        ? { headline: `${first} has reached the supplier`, subline: 'Collecting your order' }
        : { headline: 'Partner is at your store', subline: `Hand over order ${orderNumber}` };
    case 'ARRIVED_AT_DESTINATION':
      return buyer
        ? { headline: 'Arriving now', subline: `${first} has reached ${outlet}`, tone: 'success' }
        : { headline: 'Partner at the restaurant', subline: null, tone: 'success' };
    default:
      // PICKED_UP, IN_TRANSIT
      return buyer
        ? { headline: eta.text ?? 'On the way', subline: `${first} is on the way` }
        : { headline: 'Out for delivery', subline: `${first} is taking it to ${outlet}` };
  }
}

function orderCopy(a: {
  buyer: boolean;
  kind: TravelKind;
  oStatus: SupplierOrderStatus;
  supplier: string;
  order: TrackingOrder;
  dStatus: DeliveryStatus | null;
}): Copy {
  const { buyer, kind, oStatus, supplier, order, dStatus } = a;
  switch (oStatus) {
    case 'CONFIRMED':
      return buyer
        ? { headline: 'Order placed', subline: `${supplier} will start preparing it soon.`, tone: 'neutral' }
        : { headline: 'New order to prepare', subline: 'Start preparing when you are ready', tone: 'neutral' };
    case 'PREPARING':
      return buyer
        ? {
          headline: 'Packing your order',
          subline: kind === 'partner' ? 'We will assign a delivery partner soon' : `${supplier} is packing your items.`,
          tone: 'info',
        }
        : { headline: 'Pack the order', subline: 'Mark it ready once it is packed', tone: 'info' };
    case 'READY_FOR_PICKUP':
      if (kind === 'pickup') {
        return buyer
          ? { headline: 'Ready to collect', subline: `Pick up from ${order.storeName ?? supplier}.`, tone: 'success' }
          : { headline: 'Waiting for collection', subline: 'The restaurant will collect it from your store.', tone: 'info' };
      }
      if (kind === 'own') {
        return buyer
          ? {
            headline: 'Packed and ready',
            subline: `${supplier} is delivering this themselves. No live tracking.`,
            tone: 'info',
          }
          : { headline: 'Ready to send', subline: 'Dispatch it when it leaves your store.', tone: 'info' };
      }
      if (dStatus === 'CANCELLED') {
        return buyer
          ? {
            headline: 'Still arranging delivery',
            subline: 'Partners are busy nearby. Your supplier is on it; we\'ll update you here.',
            tone: 'warning',
          }
          : { headline: 'Delivery cancelled', subline: 'Request a delivery partner again.', tone: 'warning' };
      }
      return buyer
        ? { headline: 'Finding a delivery partner', subline: 'Usually takes 2 to 5 mins', tone: 'info' }
        : { headline: 'Ready to send', subline: 'Request a delivery partner to dispatch it', tone: 'info' };
    case 'OUT_FOR_DELIVERY':
      if (kind === 'own') {
        return buyer
          ? { headline: 'On the way', subline: `${supplier} is delivering this themselves. No live tracking.`, tone: 'info' }
          : { headline: 'Out for delivery', subline: 'Mark it delivered once it arrives.', tone: 'info' };
      }
      return buyer
        ? { headline: 'On the way', subline: `Your order is on its way to ${order.outletName ?? 'your outlet'}.`, tone: 'info' }
        : { headline: 'Out for delivery', subline: null, tone: 'info' };
    default:
      return { headline: oStatus, subline: null, tone: 'neutral' };
  }
}

const TIMELINE_STEP: Partial<Record<DeliveryStatus, StepKey>> = {
  DELIVERY_REQUESTED: 'ready',
  DRIVER_ASSIGNED: 'partner',
  PICKED_UP: 'picked_up',
  IN_TRANSIT: 'on_the_way',
  DELIVERED: 'delivered',
};

/** The clock time each step was reached, from the first matching timeline event. Steps with no event get none. */
export function stepTimesFromTimeline(
  events: readonly { status: DeliveryStatus; occurredAt: string }[] | null | undefined,
): Partial<Record<StepKey, string>> {
  const earliest: Partial<Record<StepKey, { ms: number; iso: string }>> = {};
  for (const event of events ?? []) {
    const key = TIMELINE_STEP[event.status];
    const ms = Date.parse(event.occurredAt);
    if (!key || !Number.isFinite(ms)) continue;
    const seen = earliest[key];
    if (!seen || ms < seen.ms) earliest[key] = { ms, iso: event.occurredAt };
  }
  const out: Partial<Record<StepKey, string>> = {};
  (Object.keys(earliest) as StepKey[]).forEach((key) => {
    const time = clockTime(earliest[key]?.iso);
    if (time) out[key] = time;
  });
  return out;
}
