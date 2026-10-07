import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useServerNow } from '@/hooks/useServerNow';
import { fetchDelivery } from '@/services/delivery';
import { fetchOutletOrders } from '@/services/procurement';
import { isApiError } from '@/lib/api/errors';
import { orderTrackingView, type OrderTrackingView } from '@/lib/delivery/orderTracking';
import { buyerTrackingHeader, type BuyerTrackHeader } from '@/lib/delivery/trackingHeader';
import type { Delivery } from '@/models/delivery';
import type { SupplierOrder, SupplierOrderStatus as Status } from '@/models/procurement';

/** The statuses in which a Costonomy delivery can exist to be asked about. */
const WITH_DELIVERY: Status[] = ['READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'];
/** The Orders tab's "Active" statuses. */
const IN_FLIGHT: Status[] = ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'];
const BAR_POLL_MS = 30_000;

/** Header states in which the partner's ETA is worth showing as a badge. */
const ETA_STATES: BuyerTrackHeader['state'][] = ['on_the_way', 'arriving', 'assigned'];

/**
 * The restaurant's most recent order that Costonomy is delivering and that is not yet delivered, or null.
 * Read from the list the caller already has: a PICKUP or supplier-delivered order is never the one.
 */
export function latestInFlight(orders: SupplierOrder[] | undefined): SupplierOrder | null {
  const candidates = (orders ?? []).filter(
    (o) => o.deliveryMode === 'COSTONOMY_DELIVERY' && IN_FLIGHT.includes(o.status),
  );
  candidates.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return candidates[0] ?? null;
}

export interface LatestInFlight {
  order: SupplierOrder;
  delivery: Delivery | null;
  view: OrderTrackingView;
  header: BuyerTrackHeader;
  /** The partner's ETA, only while it is a promise worth showing; else null. */
  etaMins: number | null;
}

/**
 * Home and the Orders tab both float a pill for this order. The hook shares their query keys, so the list and the
 * one extra delivery read are fetched once and every screen starts from the same cache.
 */
export function useLatestInFlight(outletId: number | null): LatestInFlight | null {
  const { accessToken } = useSession();
  const nowMs = useServerNow();

  const orders = useQuery({
    queryKey: ['outlet', outletId, 'orders'],
    queryFn: () => fetchOutletOrders(accessToken as string, outletId as number),
    enabled: outletId != null && accessToken != null,
  });
  const order = useMemo(() => latestInFlight(orders.data), [orders.data]);

  // One extra read for that one order: the list has its status but not where its delivery has got to. It shares the
  // order screen's key, so opening the order starts from what this already fetched.
  const delivery = useQuery({
    queryKey: ['supplier-order', order?.id, 'delivery'],
    queryFn: () => fetchDelivery(accessToken as string, order?.id as number),
    enabled: order != null && accessToken != null && WITH_DELIVERY.includes(order.status),
    retry: (count, error) => !isApiError(error) && count < 2,
    refetchInterval: BAR_POLL_MS,
  });

  if (order == null) return null;
  const d = delivery.data ?? null;
  const view = orderTrackingView({ audience: 'buyer', order, delivery: d, nowMs });
  const header = buyerTrackingHeader({ view, order, delivery: d, drop: null, nowMs });
  const etaMins = ETA_STATES.includes(header.state) && !view.delayed ? d?.etaMinutes ?? null : null;
  return { order, delivery: d, view, header, etaMins };
}
