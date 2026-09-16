import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { fetchOutletOrders } from '@/services/procurement';
import type { SupplierOrder, SupplierOrderStatus as Status } from '@/models/procurement';
import {
  MandiCard,
  MandiEmptyState,
  MandiErrorState,
  MandiScreen,
  MandiSkeletonList,
  MandiStatusChip,
  MandiText,
  OutletSelector,
} from '@/components/common';
import { resolveStatus, SupplierOrderStatus } from '@/models/status';
import { formatMoney } from '@/utils/money';
import { OrderCardHeading } from '@/components/order';
import { Colors, Radius, Spacing, TouchTarget } from '@/theme';

/** REST-ORDERS-01. Doc 05 §15 — pending, active, completed, cancelled. */
type Tab = 'pending' | 'active' | 'completed' | 'cancelled';

const TABS: { key: Tab; label: string; statuses: Status[] }[] = [
  // DRAFT sits here rather than under Active: its payment never completed, so no
  // supplier has seen it. It must still be visible somewhere — an order the
  // restaurant tried to place and that silently vanished is worse than one
  // labelled honestly.
  { key: 'pending', label: 'Pending', statuses: ['PENDING_ACCEPTANCE', 'DRAFT'] },
  {
    key: 'active',
    label: 'Active',
    statuses: ['ACCEPTED', 'PARTIALLY_ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'],
  },
  { key: 'completed', label: 'Completed', statuses: ['DELIVERED', 'RECEIVED'] },
  // Rejection, expiry and cancellation are separate business outcomes and keep
  // their own labels on the card (rule 11); they share a tab only because a
  // restaurant looks for all three in the same place.
  { key: 'cancelled', label: 'Cancelled', statuses: ['REJECTED', 'EXPIRED', 'CANCELLED'] },
];

export default function OrdersScreen() {
  const router = useRouter();
  const { accessToken } = useSession();
  const { outletId, loading: outletLoading } = useOutlet();
  const [tab, setTab] = useState<Tab>('active');

  const query = useQuery({
    queryKey: ['outlet', outletId, 'orders'],
    queryFn: () => fetchOutletOrders(accessToken as string, outletId as number),
    enabled: outletId != null && accessToken != null,
  });

  const orders = useMemo(() => {
    const statuses = TABS.find((t) => t.key === tab)?.statuses ?? [];
    return (query.data ?? []).filter((order) => statuses.includes(order.status));
  }, [query.data, tab]);

  return (
    <MandiScreen
      header={<Header tab={tab} onTab={setTab} />}
      onRefresh={() => query.refetch()}
      refreshing={query.isRefetching}
    >
      {outletLoading || query.isPending ? (
        <MandiSkeletonList count={3} />
      ) : query.error ? (
        <MandiErrorState message="Couldn't load orders." onRetry={() => query.refetch()} />
      ) : orders.length === 0 ? (
        <MandiEmptyState
          icon="receipt-outline"
          title={`No ${tab} orders`}
          description="Orders move through here as suppliers respond."
        />
      ) : (
        orders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            onPress={() => router.push(`/restaurant/orders/${order.id}`)}
          />
        ))
      )}
    </MandiScreen>
  );
}

function OrderCard({ order, onPress }: { order: SupplierOrder; onPress: () => void }) {
  return (
    <MandiCard onPress={onPress}>
      {/* The supplier leads here, not the outlet: on this side of the trade the
          restaurant already knows whose order it is, and the counterparty is
          what identifies it. The outlet still comes before the order number —
          a restaurant with three kitchens reads its list by kitchen. */}
      <OrderCardHeading
        primary={order.supplierName}
        secondary={[
          order.outletName,
          order.outletLocality,
        ]}
        items={order.items}
        orderNumber={order.orderNumber}
        paymentMethod={order.paymentMethod}
        trailing={<MandiStatusChip {...resolveStatus(SupplierOrderStatus, order.status)} size="sm" />}
      />
      <MandiText variant="price">{formatMoney(order.totalAmount)}</MandiText>
    </MandiCard>
  );
}

function Header({ tab, onTab }: { tab: Tab; onTab: (tab: Tab) => void }) {
  return (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <MandiText variant="title">Orders</MandiText>
        <OutletSelector />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {TABS.map((option) => {
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
  header: { paddingVertical: Spacing.sm, gap: Spacing.sm },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.screenHorizontal,
    gap: Spacing.md,
  },
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
