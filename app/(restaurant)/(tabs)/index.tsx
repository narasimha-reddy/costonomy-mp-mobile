import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { useCart } from '@/hooks/useCart';
import { fetchCategories } from '@/services/catalog';
import { fetchOutletOrders, fetchRequirements } from '@/services/procurement';
import { CategoryTile } from '@/components/product/CategoryTile';
import {
  MandiCard,
  MandiEmptyState,
  MandiErrorState,
  MandiHeader,
  MandiHeaderAction,
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
import { track } from '@/analytics';
import { Colors, Elevation, Radius, Spacing } from '@/theme';

const SCREEN = 'REST-HOME-01';

/**
 * REST-HOME-01. Doc 05 §5.
 *
 * <p>The hierarchy is the spec's: outlet, search, open requirements, active
 * orders, categories. Recommended procurement and buy-again arrive with the
 * recommendation feed.
 *
 * <p><b>Sections fail independently.</b> Doc 05 §5 asks for "retry per failed
 * section", and it is right here: orders failing is no reason to hide the
 * requirements a cook opened the app to check.
 */
export default function RestaurantHome() {
  const router = useRouter();
  const { me } = useSession();
  const { outletId, outlet } = useOutlet();
  const { itemCount } = useCart();

  return (
    <MandiScreen
      header={
        <MandiHeader
          title="Mandi"
          right={
            <MandiHeaderAction
              icon="cart-outline"
              label="Cart"
              badge={itemCount}
              onPress={() => {
                track('open_cart', { screen: SCREEN, outletId });
                router.push('/(restaurant)/cart');
              }}
            />
          }
        />
      }
    >
      <View style={styles.greeting}>
        <MandiText variant="subtitle">
          {greeting()}{me?.user.name ? `, ${me.user.name.split(' ')[0]}` : ''}
        </MandiText>
        <View style={styles.outletRow}>
          <MandiText variant="caption" color={Colors.textSecondary}>Ordering for</MandiText>
          <OutletSelector />
        </View>
      </View>

      <MandiSearchBar
        value=""
        onChangeText={() => {}}
        readOnly
        onPress={() => {
          track('open_search', { screen: SCREEN, outletId });
          router.push('/(restaurant)/search');
        }}
        placeholder="Search paneer, rice, oil…"
      />

      <QuickActions outletId={outletId} outletName={outlet?.name} />
      <RequirementsSection outletId={outletId} />
      <OrdersSection outletId={outletId} />
      <CategoriesSection outletId={outletId} />
    </MandiScreen>
  );
}

/** "Good morning" is worth more than a generic label: it tells you the app is live. */
function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function QuickActions({ outletId, outletName }: { outletId: number | null; outletName?: string }) {
  const router = useRouter();

  const actions = [
    {
      key: 'browse',
      icon: 'grid-outline' as const,
      label: 'Browse catalog',
      hint: 'Every supplier, compared',
      onPress: () => router.push('/(restaurant)/(tabs)/discover'),
    },
    {
      key: 'requirements',
      icon: 'clipboard-outline' as const,
      label: 'Requirements',
      hint: outletName ? `For ${outletName}` : 'What you still need',
      onPress: () => router.push('/(restaurant)/(tabs)/requirements'),
    },
  ];

  return (
    <View style={styles.quickRow}>
      {actions.map((action) => (
        <Pressable
          key={action.key}
          onPress={() => {
            track('quick_action', { screen: SCREEN, outletId }, { action: action.key });
            action.onPress();
          }}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          style={({ pressed }) => [styles.quickCard, pressed && styles.pressed]}
        >
          <View style={styles.quickIcon}>
            <Ionicons name={action.icon} size={20} color={Colors.primary} />
          </View>
          <MandiText variant="captionEmphasis">{action.label}</MandiText>
          <MandiText variant="caption" color={Colors.textTertiary} numberOfLines={1}>
            {action.hint}
          </MandiText>
        </Pressable>
      ))}
    </View>
  );
}

function RequirementsSection({ outletId }: { outletId: number | null }) {
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
      {query.isPending ? (
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
          <MandiCard
            key={requirement.id}
            onPress={() => router.push(`/(restaurant)/requirements/${requirement.id}`)}
          >
            <View style={styles.row}>
              <MandiText variant="bodyEmphasis">
                {requirement.items.length} item{requirement.items.length === 1 ? '' : 's'}
              </MandiText>
              <MandiStatusChip
                label={requirement.status.replace(/_/g, ' ').toLowerCase()}
                tone="pending"
                size="sm"
              />
            </View>
            <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1}>
              {requirement.items.map((item) => item.productName).slice(0, 3).join(', ')}
            </MandiText>
          </MandiCard>
        ))
      )}
    </View>
  );
}

function OrdersSection({ outletId }: { outletId: number | null }) {
  const router = useRouter();
  const { accessToken } = useSession();

  const query = useQuery({
    queryKey: ['outlet', outletId, 'orders'],
    queryFn: () => fetchOutletOrders(accessToken as string, outletId as number),
    enabled: outletId != null && accessToken != null,
  });

  // "Active" is everything the restaurant is still waiting on a supplier for. A
  // terminal order belongs in the Orders tab's history, and a DRAFT one never
  // reached a supplier at all — its payment did not complete — so presenting it
  // as in flight would tell the restaurant something untrue about an order
  // nobody is working on.
  const active = (query.data ?? []).filter(
    (order) => !['DRAFT', 'DELIVERED', 'RECEIVED', 'CANCELLED', 'REJECTED', 'EXPIRED']
      .includes(order.status),
  );

  return (
    <View style={styles.section}>
      <MandiSectionHeader
        title="Active orders"
        actionLabel={active.length ? 'See all' : undefined}
        onAction={() => router.push('/(restaurant)/(tabs)/orders')}
      />
      {query.isPending ? (
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
          <MandiCard
            key={order.id}
            onPress={() => router.push(`/(restaurant)/orders/${order.id}`)}
          >
            <View style={styles.row}>
              <MandiText variant="bodyEmphasis">{order.supplierName}</MandiText>
              <MandiStatusChip {...resolveStatus(SupplierOrderStatus, order.status)} size="sm" />
            </View>
            <View style={styles.row}>
              <MandiText variant="caption" color={Colors.textSecondary}>
                {order.orderNumber} · {order.items.length} items
              </MandiText>
              <MandiText variant="priceSmall">{formatMoney(order.totalAmount, true)}</MandiText>
            </View>
          </MandiCard>
        ))
      )}
    </View>
  );
}

function CategoriesSection({ outletId }: { outletId: number | null }) {
  const router = useRouter();
  const { accessToken } = useSession();

  const query = useQuery({
    queryKey: ['categories'],
    queryFn: () => fetchCategories(accessToken as string),
    enabled: accessToken != null,
    // The platform catalog's shape changes rarely; refetching it on every home
    // visit is noise on a kitchen's connection.
    staleTime: 60 * 60 * 1000,
  });

  if (query.isPending || query.error || !query.data?.length) return null;

  return (
    <View style={styles.section}>
      <MandiSectionHeader title="Browse by category" />
      <View style={styles.grid}>
        {query.data.map((category) => (
          <CategoryTile
            key={category.id}
            category={category}
            onPress={() => {
              track('open_category', { screen: SCREEN, outletId, entityId: category.id });
              router.push(`/(restaurant)/category/${category.id}`);
            }}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  greeting: { gap: Spacing.xs },
  outletRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  section: { gap: Spacing.listGap },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  quickRow: { flexDirection: 'row', gap: Spacing.sm },
  quickCard: {
    flex: 1,
    gap: Spacing.xs,
    padding: Spacing.cardPadding,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    ...Elevation.card,
  },
  quickIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryLight,
    marginBottom: Spacing.xs,
  },
  pressed: { opacity: 0.75 },
});
