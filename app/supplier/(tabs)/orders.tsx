import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { fetchActiveOrders, fetchPendingOrders } from '@/services/supplier';
import { SupplierHeader } from '@/components/supplier/SupplierHeader';
import { PendingOrderCard } from '@/components/supplier/PendingOrderCard';
import {
  MandiCard,
  MandiEmptyState,
  MandiErrorState,
  MandiScreen,
  MandiSkeletonList,
  MandiStatusChip,
  MandiText,
} from '@/components/common';
import { resolveStatus, SupplierOrderStatus } from '@/models/status';
import { formatMoney } from '@/utils/money';
import { Colors, Radius, Spacing, TouchTarget } from '@/theme';

type Tab = 'new' | 'active';

/** SUP-ORD-01 list. Doc 05 §24–§25. */
export default function SupplierOrdersScreen() {
  const router = useRouter();
  const { accessToken } = useSession();
  const { storeId } = useStore();
  const [tab, setTab] = useState<Tab>('new');

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

  const query = tab === 'new' ? pending : active;
  const orders = query.data ?? [];

  return (
    <MandiScreen
      header={<Header tab={tab} onTab={setTab} pendingCount={(pending.data ?? []).length} />}
      onRefresh={() => query.refetch()}
      refreshing={query.isRefetching}
    >
      {query.isPending ? (
        <MandiSkeletonList count={3} />
      ) : query.error ? (
        <MandiErrorState message="Couldn't load orders." onRetry={() => query.refetch()} />
      ) : orders.length === 0 ? (
        <MandiEmptyState
          icon={tab === 'new' ? 'notifications-outline' : 'cube-outline'}
          title={tab === 'new' ? 'No new orders' : 'Nothing in progress'}
          description={
            tab === 'new'
              ? 'Orders needing your answer appear here the moment they arrive.'
              : 'Accepted orders stay here until they are picked up.'
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
            <View style={styles.row}>
              <MandiText variant="bodyEmphasis">{order.orderNumber}</MandiText>
              <MandiStatusChip {...resolveStatus(SupplierOrderStatus, order.status)} size="sm" />
            </View>
            <View style={styles.row}>
              <MandiText variant="caption" color={Colors.textSecondary}>
                {order.items.length} item{order.items.length === 1 ? '' : 's'}
              </MandiText>
              <MandiText variant="priceSmall">
                {formatMoney(order.acceptedAmount ?? order.totalAmount, true)}
              </MandiText>
            </View>
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
}: {
  tab: Tab;
  onTab: (tab: Tab) => void;
  pendingCount: number;
}) {
  const tabs: { key: Tab; label: string }[] = [
    { key: 'new', label: pendingCount > 0 ? `New (${pendingCount})` : 'New' },
    { key: 'active', label: 'In progress' },
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
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: Spacing.sm, paddingBottom: Spacing.sm },
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
