import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useServerNow } from '@/hooks/useServerNow';
import { fetchDelivery } from '@/services/delivery';
import { fetchOutletOrders } from '@/services/procurement';
import { fetchIntents } from '@/services/intent';
import { intentsKey } from '@/lib/queryKeys';
import { isApiError } from '@/lib/api/errors';
import { clockTime } from '@/lib/delivery/deliveryPartner';
import { orderTrackingView } from '@/lib/delivery/orderTracking';
import { buyerTrackingHeader, type BuyerTrackHeader } from '@/lib/delivery/trackingHeader';
import type { Intent } from '@/models/intent';
import type { SupplierOrder, SupplierOrderStatus as Status } from '@/models/procurement';

/** The statuses in which a Costonomy delivery can exist to be asked about. */
const WITH_DELIVERY: Status[] = ['READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'];
/** The Orders tab's "Active" statuses. */
const IN_FLIGHT: Status[] = ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'];
const BAR_POLL_MS = 30_000;
/** An out-for-delivery order this close (by the server's own ETA) is more urgent than an answered request. */
const ARRIVING_PILL_MINS = 5;

/** Header states in which the partner's ETA is worth showing as a badge. */
const ETA_STATES: BuyerTrackHeader['state'][] = ['on_the_way', 'arriving', 'assigned'];

/** Statuses in which an order can still be "stuck" waiting on the supplier to start or hand over. */
const STALLABLE: Status[] = ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP'];
/** How long past its due moment an order may sit unchanged before the pill stops pointing at it. */
const STUCK_AFTER_MS = 12 * 3_600_000;

/**
 * Display heuristic only (no money or deadline decision), and only for choosing the pill: the order model has no
 * "status changed at", so an order that is still CONFIRMED / PREPARING / READY_FOR_PICKUP more than 12 h after the
 * later of its creation and the end of its scheduled delivery day (IST, as the server schedules) is not what the
 * kitchen is waiting on. An order scheduled for the future is never stuck. It stays in the Active Orders list and count.
 */
export function isStuck(order: SupplierOrder, nowMs: number): boolean {
  if (!STALLABLE.includes(order.status)) return false;
  const placed = Date.parse(order.createdAt);
  if (!Number.isFinite(placed)) return false;
  const day = order.scheduledDeliveryDate?.slice(0, 10);
  const dueEnd = day ? Date.parse(`${day}T23:59:59+05:30`) : NaN;
  const since = Number.isFinite(dueEnd) ? Math.max(placed, dueEnd) : placed;
  return nowMs - since > STUCK_AFTER_MS;
}

/** The orders the kitchen is still waiting on: every in-flight status, newest first as the API sends them. */
export function inFlightOrders(orders: SupplierOrder[] | undefined): SupplierOrder[] {
  return (orders ?? []).filter((o) => IN_FLIGHT.includes(o.status));
}

/**
 * The restaurant's most recent order that is not yet delivered, or null, whoever delivers it. A supplier-delivered or
 * collect-yourself order is still something the kitchen is waiting on, and its header already says so.
 */
export function latestInFlight(orders: SupplierOrder[] | undefined, nowMs?: number): SupplierOrder | null {
  const candidates = inFlightOrders(orders).filter((o) => nowMs == null || !isStuck(o, nowMs));
  candidates.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return candidates[0] ?? null;
}

/**
 * The newest request the supplier has answered and the restaurant has not yet ordered from, while it can still be
 * ordered from. The server says whether the order window is open; the app does not compare dates.
 */
export function latestAnsweredRequest(intents: Intent[] | undefined): Intent | null {
  const candidates = (intents ?? []).filter((i) => i.status === 'RESPONSES_RECEIVED' && i.withinOrderWindow);
  candidates.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return candidates[0] ?? null;
}

/** What the floating pill shows and where it goes: an order in flight, or an answered request awaiting an order. */
export interface ActivePill {
  kind: 'order' | 'request';
  supplierName: string;
  statusText: string;
  etaMins: number | null;
  href: string;
  accessibilityLabel?: string;
}

type OrderPill = ActivePill & { imminent: boolean };

/**
 * Home and the Orders tab both float a pill for this. The hook shares their query keys, so the order list, the
 * requests list and the one extra delivery read are fetched once and every screen starts from the same cache.
 * An answered request still inside its order window beats a passive in-flight order: it is the one with a clock on it.
 * An order stuck unchanged for 12 h past its due moment is ignored by the pill (see isStuck), not by the order lists.
 * An order about to arrive beats an answered request, which can wait a minute.
 */
export function useLatestInFlight(outletId: number | null): ActivePill | null {
  const { accessToken } = useSession();
  const nowMs = useServerNow();

  const orders = useQuery({
    queryKey: ['outlet', outletId, 'orders'],
    queryFn: () => fetchOutletOrders(accessToken as string, outletId as number),
    enabled: outletId != null && accessToken != null,
  });
  const order = useMemo(() => latestInFlight(orders.data, nowMs), [orders.data, nowMs]);

  const intents = useQuery({
    queryKey: intentsKey(outletId),
    queryFn: () => fetchIntents(accessToken as string, outletId as number),
    enabled: outletId != null && accessToken != null,
  });
  const request = useMemo(() => latestAnsweredRequest(intents.data), [intents.data]);

  // One extra read for that one order: the list has its status but not where its delivery has got to. It shares the
  // order screen's key, so opening the order starts from what this already fetched. Only a Costonomy delivery has
  // one; a supplier-delivered or collected order is described by its status alone.
  const delivery = useQuery({
    queryKey: ['supplier-order', order?.id, 'delivery'],
    queryFn: () => fetchDelivery(accessToken as string, order?.id as number),
    enabled: order != null && accessToken != null && order.deliveryMode === 'COSTONOMY_DELIVERY'
      && WITH_DELIVERY.includes(order.status),
    retry: (count, error) => !isApiError(error) && count < 2,
    refetchInterval: BAR_POLL_MS,
  });

  const orderPill: OrderPill | null = (() => {
    if (order == null) return null;
    const d = delivery.data ?? null;
    const view = orderTrackingView({ audience: 'buyer', order, delivery: d, nowMs });
    const header = buyerTrackingHeader({ view, order, delivery: d, drop: null, nowMs });
    const etaMins = ETA_STATES.includes(header.state) && !view.delayed ? d?.etaMinutes ?? null : null;
    const imminent = order.status === 'OUT_FOR_DELIVERY' && (header.state === 'arriving' || header.state === 'reached'
      || (header.state === 'on_the_way' && etaMins != null && etaMins <= ARRIVING_PILL_MINS));
    return {
      kind: 'order', supplierName: order.supplierName, statusText: header.title, etaMins,
      href: `/restaurant/tracking/${order.id}`, imminent,
    };
  })();

  if (request != null && !orderPill?.imminent) {
    const by = clockTime(request.orderCreationDeadline);
    return {
      kind: 'request',
      supplierName: `${request.supplierName ?? 'Your supplier'} accepted your request`,
      statusText: by != null ? `Place your order before ${by}` : 'Place your order now',
      etaMins: null,
      href: `/restaurant/requests/${request.id}`,
      accessibilityLabel: `Request answered: ${request.supplierName ?? 'your supplier'} accepted your request. Place your order`,
    };
  }
  if (orderPill == null) return null;
  const { imminent: _imminent, ...pill } = orderPill;
  return pill;
}
