import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { fetchOutletOrders } from '@/services/procurement';
import { fetchOutletDeliveryRadar } from '@/services/delivery';
import { paymentLine } from '@/lib/payments/paymentLine';
import { Ionicons } from '@expo/vector-icons';
import type { SupplierOrder, SupplierOrderStatus as Status } from '@/models/procurement';
import {
  MandiCard,
  MandiEmptyState,
  MandiErrorState,
  MandiScreen,
  MandiSkeletonList,
  MandiText,
  toneColors,
} from '@/components/common';
import { buyerOrderStatus, resolveStatus, SupplierOrderStatus } from '@/models/status';
import { OrderCardBody } from '@/components/order';
import { ActiveOrderPill } from '@/components/delivery/ActiveOrderPill';
import { RestaurantHeader } from '@/components/restaurant/RestaurantHeader';
import { useLatestInFlight } from '@/hooks/useLatestInFlight';
import { Colors, Radius, Spacing, TouchTarget } from '@/theme';

/** REST-ORDERS-01. Doc 05 §15 — pending, active, completed, cancelled. */
type Tab = 'pending' | 'active' | 'completed' | 'cancelled';

const TABS: { key: Tab; label: string; statuses: Status[] }[] = [
  // Only DRAFT now. Its payment never completed, so no supplier has seen it —
  // and after D-091 that is the one reason an order can be sitting unactioned,
  // because a funded order is confirmed outright. It must still be visible
  // somewhere: an order the restaurant tried to place and that silently
  // vanished is worse than one labelled honestly.
  { key: 'pending', label: 'Pending', statuses: ['DRAFT'] },
  {
    key: 'active',
    label: 'Active',
    statuses: ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'],
  },
  { key: 'completed', label: 'Completed', statuses: ['DELIVERED', 'COMPLETED'] },
  // One ending now. D-091 replaced rejection and expiry with a cancellation
  // that records who decided it — the distinction lives on `cancelledBy`, which
  // the card reads, rather than in three tabs that all mean "it did not happen".
  { key: 'cancelled', label: 'Cancelled', statuses: ['CANCELLED'] },
];

/** Room under the list for the pill that floats over it. */
const BAR_CLEARANCE = 96;

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

  const inFlight = useLatestInFlight(outletId);

  // The Deliveries screen's own default query (same key), so opening it starts from this; the count is the server's.
  const radar = useQuery({
    queryKey: ['outlet-delivery-radar', outletId, 'radar'],
    queryFn: () => fetchOutletDeliveryRadar(accessToken as string, outletId as number),
    enabled: outletId != null && accessToken != null,
  });
  const activeDeliveries = radar.data?.summary.totalActive ?? null;

  const orders = useMemo(() => {
    const statuses = TABS.find((t) => t.key === tab)?.statuses ?? [];
    return (query.data ?? []).filter((order) => statuses.includes(order.status));
  }, [query.data, tab]);

  return (
    <MandiScreen
      header={<Header tab={tab} onTab={setTab} activeDeliveries={activeDeliveries} onDeliveries={() => router.push('/restaurant/deliveries')} />}
      onRefresh={() => query.refetch()}
      refreshing={query.isRefetching}
      contentStyle={inFlight != null ? { paddingBottom: BAR_CLEARANCE } : undefined}
      floating={inFlight != null ? (
        <ActiveOrderPill
          supplierName={inFlight.supplierName}
          statusText={inFlight.statusText}
          etaMins={inFlight.etaMins}
          accessibilityLabel={inFlight.accessibilityLabel}
          onPress={() => router.push(inFlight.href)}
        />
      ) : undefined}
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
    <MandiCard
      onPress={onPress}
      accentColor={toneColors(resolveStatus(SupplierOrderStatus, order.status).tone).fg}
    >
      {/* The supplier leads here, not the outlet: on this side of the trade the
          restaurant already knows whose order it is, and the counterparty is
          what identifies it. The outlet still comes before the order number —
          a restaurant with three kitchens reads its list by kitchen. */}
      <OrderCardBody
        primary={order.supplierName}
        secondary={[
          order.outletName,
          order.outletLocality,
        ]}
        items={order.items}
        orderNumber={order.orderNumber}
        paymentMethod={order.paymentMethod}
        createdAt={order.createdAt}
        amount={paymentLine(order).amount}
        status={buyerOrderStatus(order.status, order.deliveryMode)}
      />
    </MandiCard>
  );
}

function Header({ tab, onTab, activeDeliveries, onDeliveries }: {
  tab: Tab;
  onTab: (tab: Tab) => void;
  activeDeliveries: number | null;
  onDeliveries: () => void;
}) {
  return (
    <View style={styles.header}>
      <RestaurantHeader screen="REST-ORDERS-01" subtitle="Orders" />
      <Pressable
        onPress={onDeliveries}
        accessibilityRole="button"
        accessibilityLabel={activeDeliveries != null && activeDeliveries > 0 ? `Deliveries, ${activeDeliveries} active` : 'Deliveries'}
        style={styles.deliveries}
      >
        <Ionicons name="bicycle-outline" size={18} color={Colors.primaryDark} />
        <MandiText variant="captionEmphasis" color={Colors.primaryDark}>
          {activeDeliveries != null && activeDeliveries > 0 ? `Deliveries · ${activeDeliveries} active` : 'Deliveries'}
        </MandiText>
        <Ionicons name="chevron-forward" size={16} color={Colors.primaryDark} />
      </Pressable>
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
  header: { gap: Spacing.sm, paddingBottom: Spacing.sm },
  deliveries: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.xs,
    marginHorizontal: Spacing.screenHorizontal,
    paddingHorizontal: Spacing.md,
    minHeight: TouchTarget.min - 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.primaryLight,
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
