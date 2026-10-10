import type { DeliveryMode, DeliveryStatus } from '@/models/delivery';

/** The backend stores a rider fix about every 5 s, so a live truck is refetched at that pace. */
export const LIVE_POLL_MS = 5_000;
export const ACTIVE_POLL_MS = 15_000;
/** With the socket up, this is a safety net rather than the transport. */
export const BACKSTOP_POLL_MS = 60_000;

/** Statuses in which a partner's truck is on the move and its position is worth drawing. */
const LIVE_PARTNER = new Set<string>(['DRIVER_ASSIGNED', 'DRIVER_AT_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_DESTINATION']);
const ENDED = new Set<string>(['DELIVERED', 'CANCELLED', 'DELIVERY_FAILED']);

/**
 * How often the delivery query refetches, as react-query's refetchInterval wants it: milliseconds, or false for
 * "do not poll". An unfocused screen and an ended delivery do not poll; a Costonomy partner on the road polls at the
 * rider-fix pace whatever the transport (the socket carries events, not positions); everything else keeps the old
 * 15 s, or the 60 s backstop while the socket is up.
 */
export function trackingPollMs(opts: {
  status?: DeliveryStatus | string | null;
  mode?: DeliveryMode | string | null;
  focused: boolean;
  socket: boolean;
}): number | false {
  if (!opts.focused) return false;
  if (opts.status != null && ENDED.has(opts.status)) return false;
  if (opts.mode === 'COSTONOMY' && opts.status != null && LIVE_PARTNER.has(opts.status)) return LIVE_POLL_MS;
  return opts.socket ? BACKSTOP_POLL_MS : ACTIVE_POLL_MS;
}
