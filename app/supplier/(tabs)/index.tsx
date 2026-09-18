import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { RequestCarousel } from '@/components/supplier/RequestCarousel';
import { fetchActiveOrders, fetchPendingOrders } from '@/services/supplier';
import { SupplierHeader } from '@/components/supplier/SupplierHeader';
import { PendingOrderCard } from '@/components/supplier/PendingOrderCard';
import {
  MandiCard,
  MandiEmptyState,
  MandiErrorState,
  MandiScreen,
  MandiSectionHeader,
  MandiSkeletonList,
  MandiStatusChip,
} from '@/components/common';
import { resolveStatus, SupplierOrderStatus } from '@/models/status';
import { formatDistance, orderValue } from '@/utils/orders';
import { OrderCardBody } from '@/components/order';
import { Spacing } from '@/theme';

/**
 * SUP-HOME-01. Doc 05 §24.
 *
 * <p>New orders come first and are the only thing on this screen with a running
 * clock — §24 requires urgent acceptance items to be visually prioritised, and
 * for a supplier the sixty-second window is the whole job.
 *
 * <p>Pending orders poll. Everything else here changes on the supplier's own
 * action; an unanswered order is changing because a deadline is passing.
 */
export default function SupplierHome() {
  const router = useRouter();
  const { accessToken } = useSession();
  const { storeId } = useStore();

  const pending = useQuery({
    queryKey: ['store', storeId, 'orders', 'pending'],
    queryFn: () => fetchPendingOrders(accessToken as string, storeId as number),
    enabled: storeId != null && accessToken != null,
    refetchInterval: 15_000,
  });

  const active = useQuery({
    queryKey: ['store', storeId, 'orders', 'active'],
    queryFn: () => fetchActiveOrders(accessToken as string, storeId as number),
    enabled: storeId != null && accessToken != null,
  });

  return (
    <MandiScreen
      header={<SupplierHeader />}
      onRefresh={() => {
        void pending.refetch();
        void active.refetch();
      }}
      refreshing={pending.isRefetching || active.isRefetching}
    >
      {/* Above New orders: an order here has already been agreed to, while a
          request has somebody waiting on an answer only this store can give. */}
      <RequestCarousel />

      <View style={styles.section}>
        {/* No "respond within" any more: an order reaching this store has
            already been agreed to when the request behind it was answered, so
            there is nothing here to respond to and no clock running. The SLA
            moved to the request, which is where it is now shown. */}
        <MandiSectionHeader
          title="New orders"
          count={(pending.data ?? []).length}
        />
        {pending.isPending ? (
          <MandiSkeletonList count={2} />
        ) : pending.error ? (
          <MandiErrorState message="Couldn't load new orders." onRetry={() => pending.refetch()} />
        ) : (pending.data ?? []).length === 0 ? (
          <MandiEmptyState
            compact
            icon="notifications-outline"
            title="No new orders"
            description="Orders needing your answer appear here the moment they arrive."
          />
        ) : (
          (pending.data ?? []).map((order) => (
            <PendingOrderCard
              key={order.id}
              order={order}
              onPress={() => router.push(`/supplier/orders/${order.id}`)}
            />
          ))
        )}
      </View>

      <View style={styles.section}>
        <MandiSectionHeader
          title="In progress"
          count={(active.data ?? []).length}
          actionLabel={(active.data ?? []).length ? 'See all' : undefined}
          onAction={() => router.push('/supplier/(tabs)/orders')}
        />
        {active.isPending ? (
          <MandiSkeletonList count={2} />
        ) : active.error ? (
          <MandiErrorState message="Couldn't load orders." onRetry={() => active.refetch()} />
        ) : (active.data ?? []).length === 0 ? (
          <MandiEmptyState
            compact
            icon="cube-outline"
            title="Nothing in progress"
            description="Accepted orders show here until they're picked up."
          />
        ) : (
          (active.data ?? []).slice(0, 5).map((order) => (
            <MandiCard key={order.id} onPress={() => router.push(`/supplier/orders/${order.id}`)}>
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
                trailing={
                  <MandiStatusChip {...resolveStatus(SupplierOrderStatus, order.status)} size="sm" />
                }
              />
            </MandiCard>
          ))
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
