import type { DeliveryMode, DeliveryStatus } from '@/models/delivery';

/** The backend stores a rider fix about every 5 s, so a live truck is refetched at that pace. */
export const LIVE_POLL_MS = 5_000;
export const ACTIVE_POLL_MS = 15_000;
/** With the socket up, this is a safety net rather than the transport. */
export const BACKSTOP_POLL_MS = 60_000;

/** Statuses in which a partner's truck is on the move and its position is worth drawing. */
const LIVE_PARTNER = new Set<string>(['DRIVER_ASSIGNED', 'DRIVER_AT_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_DESTINATION']);
/**
 * Over for good. A failed delivery is NOT here: it is waiting for our team to resolve it (deliver it, or cancel and
 * refund), and the screen has to keep listening to learn which, rather than showing "failed" for ever.
 */
const ENDED = new Set<string>(['DELIVERED', 'CANCELLED']);
/** How often a failed or under-review delivery is asked about: a person resolves it, so there is no rider to follow. */
export const REVIEW_POLL_MS = 30_000;

/**
 * How often the delivery query refetches, as react-query's refetchInterval wants it: milliseconds, or false for
 * "do not poll". An unfocused screen and an ended delivery do not poll; a Costonomy partner on the road polls at the
 * rider-fix pace whatever the transport (the socket carries events, not positions); everything else keeps the old
 * 15 s, or the 60 s backstop while the socket is up.
 */
export function trackingPollMs(opts: {
  status?: DeliveryStatus | string | null;
  mode?: DeliveryMode | string | null;
  /** The server says our team is looking at it (`Delivery.underReview`). */
  underReview?: boolean | null;
  focused: boolean;
  socket: boolean;
}): number | false {
  if (!opts.focused) return false;
  if (opts.status != null && ENDED.has(opts.status)) return false;
  if (opts.status === 'DELIVERY_FAILED' || opts.underReview === true) return REVIEW_POLL_MS;
  if (opts.mode === 'COSTONOMY' && opts.status != null && LIVE_PARTNER.has(opts.status)) return LIVE_POLL_MS;
  return opts.socket ? BACKSTOP_POLL_MS : ACTIVE_POLL_MS;
}

const ORDER_ENDED = new Set<string>(['COMPLETED', 'CANCELLED']);

/**
 * The delivery query's `refetchInterval` for an order screen. Stops when the delivery is over for good, or when there is
 * no delivery and the order is over; a failed or under-review delivery keeps being asked about until the server reports
 * it resolved (delivered, or cancelled with the order).
 */
export function deliveryRefetchMs(opts: {
  delivery?: { status?: string | null; mode?: string | null; underReview?: boolean | null } | null;
  orderStatus?: string | null;
  focused: boolean;
  socket: boolean;
}): number | false {
  const status = opts.delivery?.status ?? null;
  if (status == null && opts.orderStatus != null && ORDER_ENDED.has(opts.orderStatus)) return false;
  return trackingPollMs({
    status, mode: opts.delivery?.mode, underReview: opts.delivery?.underReview, focused: opts.focused, socket: opts.socket,
  });
}
