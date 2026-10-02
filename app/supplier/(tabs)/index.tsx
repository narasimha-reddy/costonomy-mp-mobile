import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { RequestCarousel } from '@/components/supplier/RequestCarousel';
import { fetchActiveOrders } from '@/services/supplier';
import { SupplierHeader } from '@/components/supplier/SupplierHeader';
import {
  MandiCard,
  MandiEmptyState,
  MandiErrorState,
  MandiScreen,
  MandiSectionHeader,
  MandiSkeletonList,
  toneColors,
} from '@/components/common';
import { resolveStatus, SupplierOrderStatus } from '@/models/status';
import { formatDistance, orderValue } from '@/utils/orders';
import { OrderCardBody } from '@/components/order';
import type { IncomingOrder } from '@/models/procurement';
import { Spacing } from '@/theme';

/**
 * SUP-HOME-01. Doc 05 §24.
 *
 * <p>Two sections: what somebody is waiting on an answer for, and what this
 * store has to work on.
 *
 * <p><b>Requests lead.</b> An order here has already been agreed to — it needs
 * work but no decision. A request is the opposite: a kitchen is blocked on an
 * answer only this store can give, and until it comes nothing else happens.
 *
 * <p><b>One orders section, not two.</b> It was split into "New orders" and "In
 * progress", which made sense while an order arrived needing acceptance inside
 * a sixty-second window. D-091 removed that: an order arrives confirmed and
 * paid for, so the split no longer separated two kinds of thing — and because
 * both lists were served from statuses that overlapped at {@code CONFIRMED},
 * the same order appeared twice.
 *
 * <p>What the split was worth is kept without it: orders nobody has started are
 * ordered first and outlined, so the one thing needing a supplier's hand still
 * reads as such.
 *
 * <p>Nothing here polls. Every state on this screen changes on this store's own
 * action or on a courier's event, and the request carousel refreshes itself.
 */
export default function SupplierHome() {
  const router = useRouter();
  const { accessToken } = useSession();
  const { storeId } = useStore();

  const orders = useQuery({
    queryKey: ['store', storeId, 'orders', 'active'],
    queryFn: () => fetchActiveOrders(accessToken as string, storeId as number),
    enabled: storeId != null && accessToken != null,
  });

  /**
   * Unstarted first, then by age.
   *
   * <p>The priority the two sections used to carry. An order nobody has begun
   * is the one with a decision attached to it; one already being prepared is a
   * job in hand.
   */
  const sorted = React.useMemo(() => {
    const unstarted = (order: IncomingOrder) => (order.status === 'CONFIRMED' ? 0 : 1);
    return [...(orders.data ?? [])].sort((a, b) =>
      unstarted(a) - unstarted(b) || a.createdAt.localeCompare(b.createdAt));
  }, [orders.data]);

  return (
    <MandiScreen
      header={<SupplierHeader />}
      onRefresh={() => orders.refetch()}
      refreshing={orders.isRefetching}
    >
      <RequestCarousel />

      <View style={styles.section}>
        <MandiSectionHeader
          title="Orders"
          count={sorted.length}
          subtitle={
            sorted.some((order) => order.status === 'CONFIRMED')
              ? 'Some are waiting for you to start'
              : undefined
          }
          actionLabel={sorted.length ? 'See all' : undefined}
          onAction={() => router.push('/supplier/(tabs)/orders')}
        />
        {orders.isPending ? (
          <MandiSkeletonList count={2} />
        ) : orders.error ? (
          <MandiErrorState message="Couldn't load orders." onRetry={() => orders.refetch()} />
        ) : sorted.length === 0 ? (
          <MandiEmptyState
            compact
            icon="cube-outline"
            title="No orders yet"
            description="Orders appear here once a kitchen orders against a request you accepted."
          />
        ) : (
          sorted.slice(0, 5).map((order) => {
            const started = order.status !== 'CONFIRMED';
            return (
              <MandiCard
                key={order.id}
                onPress={() => router.push(`/supplier/orders/${order.id}`)}
                outlined={!started}
                accentColor={toneColors(
                  resolveStatus(SupplierOrderStatus, order.status).tone).fg}
              >
                <OrderCardBody
                  primary={order.outletName}
                  secondary={[
                    order.restaurantName,
                    order.outletLocality,
                    formatDistance(order.distanceKm),
                  ]}
                  items={order.items}
                  orderNumber={order.orderNumber}
                  paymentMethod={order.paymentMethod}
                  createdAt={order.createdAt}
                  amount={orderValue(order)}
                  status={resolveStatus(SupplierOrderStatus, order.status)}
                />
              </MandiCard>
            );
          })
        )}
      </View>

    </MandiScreen>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  section: { gap: Spacing.listGap },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
});
