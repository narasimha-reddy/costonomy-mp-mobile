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
  MandiButton,
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
import { orderInbox } from '@/lib/supplier/orderInbox';
import { partyTitle } from '@/lib/supplier/partyTitle';
import { Spacing } from '@/theme';

/** Cards shown per section; the rest are behind "See all orders". */
const SECTION_LIMIT = 5;

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
 * <p><b>Orders are an action inbox.</b> One section per stage that needs the
 * store — new orders to start, packing, waiting for the rider, out for delivery —
 * newest first inside each, empty ones hidden. The home used to list the five
 * oldest orders, so a new order was not on the screen at all. Each order is in
 * exactly one section (the stage is its status), so none can appear twice.
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

  const sections = React.useMemo(() => orderInbox(orders.data ?? []), [orders.data]);
  const total = orders.data?.length ?? 0;

  return (
    <MandiScreen
      header={<SupplierHeader />}
      onRefresh={() => orders.refetch()}
      refreshing={orders.isRefetching}
    >
      <RequestCarousel />

      {orders.isPending ? (
        <MandiSkeletonList count={2} />
      ) : orders.error ? (
        <MandiErrorState message="Couldn't load orders." onRetry={() => orders.refetch()} />
      ) : total === 0 ? (
        <View style={styles.section}>
          <MandiSectionHeader title="Orders" />
          <MandiEmptyState
            compact
            icon="cube-outline"
            title="No orders yet"
            description="Orders appear here once a kitchen orders against a request you accepted."
          />
        </View>
      ) : (
        <>
          {sections.map((section) => (
            <View key={section.status} style={styles.section}>
              <MandiSectionHeader title={section.title} count={section.orders.length} />
              {section.orders.slice(0, SECTION_LIMIT).map((order) => (
                <MandiCard
                  key={order.id}
                  onPress={() => router.push(`/supplier/orders/${order.id}`)}
                  outlined={order.status === 'CONFIRMED'}
                  accentColor={toneColors(
                    resolveStatus(SupplierOrderStatus, order.status).tone).fg}
                >
                  <OrderCardBody
                    primary={partyTitle(order.restaurantName, order.outletName)}
                    secondary={[
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
              ))}
            </View>
          ))}
          <MandiButton
            label="See all orders"
            variant="secondary"
            size="md"
            onPress={() => router.push('/supplier/(tabs)/orders')}
          />
        </>
      )}

    </MandiScreen>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  section: { gap: Spacing.listGap },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
});
