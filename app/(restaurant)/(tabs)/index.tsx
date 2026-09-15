import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { fetchCategories } from '@/services/catalog';
import { fetchOutletOrders, fetchRequirements } from '@/services/procurement';
import {
  MandiCard,
  MandiEmptyState,
  MandiErrorState,
  MandiScreen,
  MandiSearchBar,
  MandiSectionHeader,
  MandiSkeletonList,
  MandiStatusChip,
  MandiText,
  OutletSelector,
} from '@/components/common';
import { resolveStatus, SupplierOrderStatus } from '@/models/status';
import { formatMoney } from '@/utils/money';
import { Colors, Spacing } from '@/theme';

/**
 * REST-HOME-01. Doc 05 §5.
 *
 * <p>The hierarchy is the spec's: outlet, search, open requirements, active
 * orders, categories. Recommended procurement and buy-again arrive with the
 * recommendation feed.
 *
 * <p><b>Sections fail independently.</b> Doc 05 §5 asks for "retry per failed
 * section", and it is the right shape here — orders failing is no reason to hide
 * the requirements a cook opened the app to check.
 */
export default function RestaurantHome() {
  const router = useRouter();
  const { me } = useSession();
  const { outletId, loading: outletLoading } = useOutlet();

  return (
    <MandiScreen header={<Header />}>
      <MandiSearchBar
        value=""
        onChangeText={() => {}}
        readOnly
        onPress={() => router.push('/(restaurant)/search')}
        placeholder="Search paneer, rice, oil…"
      />

      <RequirementsSection outletId={outletId} loading={outletLoading} />
      <OrdersSection outletId={outletId} loading={outletLoading} />
      <CategoriesSection />

      <MandiText variant="caption" color={Colors.textTertiary}>
        Signed in as {me?.user.name ?? me?.user.phone}
      </MandiText>
    </MandiScreen>
  );
}

function Header() {
  return (
    <View style={styles.header}>
      <MandiText variant="title">Mandi</MandiText>
      <OutletSelector />
    </View>
  );
}

function RequirementsSection({ outletId, loading }: { outletId: number | null; loading: boolean }) {
  const router = useRouter();
  const { accessToken } = useSession();

  const query = useQuery({
    queryKey: ['outlet', outletId, 'requirements'],
    queryFn: () => fetchRequirements(accessToken as string, outletId as number),
    enabled: outletId != null && accessToken != null,
  });

  const open = (query.data ?? []).filter(
    (r) => r.status === 'OPEN' || r.status === 'SOURCING' || r.status === 'PARTIALLY_FULFILLED',
  );

  return (
    <View style={styles.section}>
      <MandiSectionHeader
        title="Open requirements"
        actionLabel={open.length ? 'See all' : undefined}
        onAction={() => router.push('/(restaurant)/(tabs)/requirements')}
      />
      {loading || query.isPending ? (
        <MandiSkeletonList count={2} />
      ) : query.error ? (
        <MandiErrorState message="Couldn't load requirements." onRetry={() => query.refetch()} />
      ) : open.length === 0 ? (
        <MandiEmptyState
          compact
          icon="clipboard-outline"
          title="Nothing outstanding"
          description="Requirements you raise show here until they're fulfilled."
        />
      ) : (
        open.slice(0, 3).map((requirement) => (
          <MandiCard key={requirement.id} onPress={() => router.push(`/(restaurant)/requirements/${requirement.id}`)}>
            <View style={styles.row}>
              <MandiText variant="bodyEmphasis">
                {requirement.items.length} item{requirement.items.length === 1 ? '' : 's'}
              </MandiText>
              <MandiStatusChip label={requirement.status.replace(/_/g, ' ').toLowerCase()} tone="pending" size="sm" />
            </View>
            <MandiText variant="caption" color={Colors.textSecondary}>
              {requirement.items.map((item) => item.productName).slice(0, 3).join(', ')}
            </MandiText>
          </MandiCard>
        ))
      )}
    </View>
  );
}

function OrdersSection({ outletId, loading }: { outletId: number | null; loading: boolean }) {
  const router = useRouter();
  const { accessToken } = useSession();

  const query = useQuery({
    queryKey: ['outlet', outletId, 'orders'],
    queryFn: () => fetchOutletOrders(accessToken as string, outletId as number),
    enabled: outletId != null && accessToken != null,
  });

  // "Active" is everything the restaurant is still waiting on. A terminal order
  // belongs in the Orders tab's history, not on the home screen.
  const active = (query.data ?? []).filter(
    (order) => !['DELIVERED', 'RECEIVED', 'CANCELLED', 'REJECTED', 'EXPIRED'].includes(order.status),
  );

  return (
    <View style={styles.section}>
      <MandiSectionHeader
        title="Active orders"
        actionLabel={active.length ? 'See all' : undefined}
        onAction={() => router.push('/(restaurant)/(tabs)/orders')}
      />
      {loading || query.isPending ? (
        <MandiSkeletonList count={2} />
      ) : query.error ? (
        <MandiErrorState message="Couldn't load orders." onRetry={() => query.refetch()} />
      ) : active.length === 0 ? (
        <MandiEmptyState
          compact
          icon="cube-outline"
          title="No orders in flight"
          description="Search for what you need and place your first order."
        />
      ) : (
        active.slice(0, 3).map((order) => (
          <MandiCard key={order.id} onPress={() => router.push(`/(restaurant)/orders/${order.id}`)}>
            <View style={styles.row}>
              <MandiText variant="bodyEmphasis">{order.supplierName}</MandiText>
              <MandiStatusChip {...resolveStatus(SupplierOrderStatus, order.status)} size="sm" />
            </View>
            <MandiText variant="caption" color={Colors.textSecondary}>
              {order.orderNumber} · {order.items.length} items · {formatMoney(order.totalAmount, true)}
            </MandiText>
          </MandiCard>
        ))
      )}
    </View>
  );
}

function CategoriesSection() {
  const router = useRouter();
  const { accessToken } = useSession();

  const query = useQuery({
    queryKey: ['categories'],
    queryFn: () => fetchCategories(accessToken as string),
    enabled: accessToken != null,
    // The platform catalog's shape changes rarely; refetching it on every home
    // visit is pure noise on a kitchen's connection.
    staleTime: 60 * 60 * 1000,
  });

  if (query.isPending || query.error || !query.data?.length) return null;

  return (
    <View style={styles.section}>
      <MandiSectionHeader title="Browse by category" />
      <View style={styles.categoryGrid}>
        {query.data.map((category) => (
          <MandiCard
            key={category.id}
            compact
            style={styles.categoryCard}
            onPress={() => router.push(`/(restaurant)/category/${category.id}`)}
          >
            <MandiText variant="captionEmphasis" numberOfLines={2}>{category.name}</MandiText>
          </MandiCard>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.screenHorizontal,
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  section: { gap: Spacing.listGap },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  categoryCard: { width: '31%', minHeight: 64, justifyContent: 'center' },
});
