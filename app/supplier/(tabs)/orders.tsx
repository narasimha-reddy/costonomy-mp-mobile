import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { fetchActiveOrders, fetchOrderHistory, fetchPendingOrders } from '@/services/supplier';
import { SupplierHeader } from '@/components/supplier/SupplierHeader';
import { PendingOrderCard } from '@/components/supplier/PendingOrderCard';
import { OrderCardBody } from '@/components/order';
import {
  MandiCard,
  MandiDateRangeFilter,
  MandiEmptyState,
  MandiErrorState,
  MandiScreen,
  MandiSkeletonList,
  MandiStatusChip,
  MandiText,
} from '@/components/common';
import { resolveStatus, SupplierOrderStatus } from '@/models/status';
import { formatDistance, orderValue } from '@/utils/orders';
import { defaultRange, describeRange, toQuery, type DateRange } from '@/utils/dateRange';
import { Colors, Radius, Spacing, TouchTarget } from '@/theme';

type Tab = 'new' | 'active' | 'missed' | 'all';

/**
 * Only the last two are dated.
 *
 * <p>New and In progress are about now — an order counting down, or one being
 * packed — and a date filter over them would be a control that can only hide work
 * somebody still has to do. Missed and All are history, and history needs a
 * window or it is a table scan.
 */
const DATED: Tab[] = ['missed', 'all'];

/** SUP-ORD-01 list. Doc 05 §24–§25. */
export default function SupplierOrdersScreen() {
  const router = useRouter();
  const { accessToken } = useSession();
  const { storeId } = useStore();
  const [tab, setTab] = useState<Tab>('new');
  const [range, setRange] = useState(defaultRange());
  const dated = DATED.includes(tab);

  const pending = useQuery({
    queryKey: ['store', storeId, 'orders', 'pending'],
    queryFn: () => fetchPendingOrders(accessToken as string, storeId as number),
    enabled: storeId != null && accessToken != null,
    refetchInterval: tab === 'new' ? 15_000 : false,
  });

  const active = useQuery({
    queryKey: ['store', storeId, 'orders', 'active'],
    queryFn: () => fetchActiveOrders(accessToken as string, storeId as number),
    enabled: storeId != null && accessToken != null,
  });

  const history = useQuery({
    // The range is in the key, so changing it refetches rather than showing the
    // previous window's orders under the new label.
    queryKey: ['store', storeId, 'orders', tab, range.from.toISOString(), range.to.toISOString()],
    queryFn: () => fetchOrderHistory(
      accessToken as string, storeId as number, toQuery(range),
      tab === 'missed' ? ['EXPIRED'] : undefined),
    enabled: storeId != null && accessToken != null && dated,
  });

  const query = tab === 'new' ? pending : tab === 'active' ? active : history;
  const orders = query.data ?? [];

  return (
    <MandiScreen
      header={
        <Header
          tab={tab}
          onTab={setTab}
          pendingCount={(pending.data ?? []).length}
          range={range}
          onRange={setRange}
          dated={dated}
        />
      }
      onRefresh={() => query.refetch()}
      refreshing={query.isRefetching}
    >
      {query.isPending ? (
        <MandiSkeletonList count={3} />
      ) : query.error ? (
        <MandiErrorState message="Couldn't load orders." onRetry={() => query.refetch()} />
      ) : orders.length === 0 ? (
        <MandiEmptyState
          icon={tab === 'new' ? 'notifications-outline'
            : tab === 'missed' ? 'time-outline' : 'cube-outline'}
          title={
            tab === 'new' ? 'No new orders'
              : tab === 'active' ? 'Nothing in progress'
              : tab === 'missed' ? 'Nothing missed'
              : 'No orders in this period'
          }
          description={
            tab === 'new'
              ? 'Orders needing your answer appear here the moment they arrive.'
              : tab === 'active'
                ? 'Accepted orders stay here until they are picked up.'
                : tab === 'missed'
                  // Said as the good news it is, and scoped to the window, so an
                  // empty list is not read as "we lost your orders".
                  ? `You answered every order in ${describeRange(range).toLowerCase()}.`
                  : `Nothing arrived in ${describeRange(range).toLowerCase()}. Try a wider period.`
          }
        />
      ) : tab === 'new' ? (
        orders.map((order) => (
          <PendingOrderCard
            key={order.id}
            order={order}
            onPress={() => router.push(`/supplier/orders/${order.id}`)}
          />
        ))
      ) : (
        orders.map((order) => (
          <MandiCard key={order.id} onPress={() => router.push(`/supplier/orders/${order.id}`)}>
            {/* The amount is what the store committed to, not what was asked
                for. After a partial acceptance those differ, and only the
                first is theirs. */}
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
    </MandiScreen>
  );
}

function Header({
  tab,
  onTab,
  pendingCount,
  range,
  onRange,
  dated,
}: {
  tab: Tab;
  onTab: (tab: Tab) => void;
  pendingCount: number;
  range: DateRange;
  onRange: (next: DateRange) => void;
  dated: boolean;
}) {
  const tabs: { key: Tab; label: string }[] = [
    { key: 'new', label: pendingCount > 0 ? `New (${pendingCount})` : 'New' },
    { key: 'active', label: 'In progress' },
    // "Missed", not "Expired": expiry is what the database calls it, and the
    // supplier's question is which orders they let go.
    { key: 'missed', label: 'Missed' },
    { key: 'all', label: 'All' },
  ];

  return (
    <View style={styles.header}>
      <SupplierHeader subtitle="Orders" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {tabs.map((option) => {
          const active = option.key === tab;
          return (
            <Pressable
              key={option.key}
              onPress={() => onTab(option.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={[styles.tab, active && styles.tabActive]}
            >
              <MandiText
                variant="captionEmphasis"
                color={active ? Colors.textInverse : Colors.textSecondary}
              >
                {option.label}
              </MandiText>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Only where a window means something. On New and In progress a date
          filter could only hide work someone still has to do. */}
      {dated ? (
        <View style={styles.filterRow}>
          <MandiDateRangeFilter value={range} onChange={onRange} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: Spacing.sm, paddingBottom: Spacing.sm },
  filterRow: { paddingHorizontal: Spacing.screenHorizontal },
  tabs: { paddingHorizontal: Spacing.screenHorizontal, gap: Spacing.sm },
  tab: {
    paddingHorizontal: Spacing.lg,
    justifyContent: 'center',
    minHeight: TouchTarget.min - 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceSunken,
  },
  tabActive: { backgroundColor: Colors.primary },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
});
