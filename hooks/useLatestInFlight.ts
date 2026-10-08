import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useServerNow } from '@/hooks/useServerNow';
import { fetchDelivery } from '@/services/delivery';
import { fetchOutletOrders } from '@/services/procurement';
import { fetchIntents } from '@/services/intent';
import { intentsKey } from '@/lib/queryKeys';
import { isApiError } from '@/lib/api/errors';
import { orderTrackingView } from '@/lib/delivery/orderTracking';
import { buyerTrackingHeader, type BuyerTrackHeader } from '@/lib/delivery/trackingHeader';
import type { Intent } from '@/models/intent';
import type { SupplierOrder, SupplierOrderStatus as Status } from '@/models/procurement';

/** The statuses in which a Costonomy delivery can exist to be asked about. */
const WITH_DELIVERY: Status[] = ['READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'];
/** The Orders tab's "Active" statuses. */
const IN_FLIGHT: Status[] = ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'];
const BAR_POLL_MS = 30_000;

/** Header states in which the partner's ETA is worth showing as a badge. */
const ETA_STATES: BuyerTrackHeader['state'][] = ['on_the_way', 'arriving', 'assigned'];

/**
 * The restaurant's most recent order that is not yet delivered, or null, whoever delivers it. A supplier-delivered or
 * collect-yourself order is still something the kitchen is waiting on, and its header already says so.
 */
export function latestInFlight(orders: SupplierOrder[] | undefined): SupplierOrder | null {
  const candidates = (orders ?? []).filter((o) => IN_FLIGHT.includes(o.status));
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

/** "6:30 pm" in the device's locale; display only. */
function clockTime(iso: string | null): string | null {
  if (iso == null) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  return t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
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

/**
 * Home and the Orders tab both float a pill for this. The hook shares their query keys, so the order list, the
 * requests list and the one extra delivery read are fetched once and every screen starts from the same cache.
 * An order in flight beats a pending request: it is further along.
 */
export function useLatestInFlight(outletId: number | null): ActivePill | null {
  const { accessToken } = useSession();
  const nowMs = useServerNow();

  const orders = useQuery({
    queryKey: ['outlet', outletId, 'orders'],
    queryFn: () => fetchOutletOrders(accessToken as string, outletId as number),
    enabled: outletId != null && accessToken != null,
  });
  const order = useMemo(() => latestInFlight(orders.data), [orders.data]);

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

  if (order != null) {
    const d = delivery.data ?? null;
    const view = orderTrackingView({ audience: 'buyer', order, delivery: d, nowMs });
    const header = buyerTrackingHeader({ view, order, delivery: d, drop: null, nowMs });
    const etaMins = ETA_STATES.includes(header.state) && !view.delayed ? d?.etaMinutes ?? null : null;
    return {
      kind: 'order', supplierName: order.supplierName, statusText: header.title, etaMins,
      href: `/restaurant/tracking/${order.id}`,
    };
  }
  if (request != null) {
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
  return null;
}
