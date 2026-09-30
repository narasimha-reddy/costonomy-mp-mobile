import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { fetchCategories } from '@/services/catalog';
import { fetchOutletOrders } from '@/services/procurement';
import { fetchIntents } from '@/services/intent';
import { fetchQuickScanConfig } from '@/services/quickscan';
import { intentsKey } from '@/lib/queryKeys';
import { CategoryTile } from '@/components/product/CategoryTile';
import {
  MandiCard,
  MandiEmptyState,
  MandiErrorState,
  MandiScreen,
  MandiSearchBar,
  MandiSectionHeader,
  MandiSkeletonList,
  MandiText,
  toneColors,
} from '@/components/common';
import {
  resolveStatus,
  SupplierOrderStatus,
} from '@/models/status';
import { OrderCardBody } from '@/components/order';
import { RestaurantHeader } from '@/components/restaurant/RestaurantHeader';
import { RestaurantRequestCard } from '@/components/request/RestaurantRequestCard';
import { PopularSuppliersCarousel } from '@/components/restaurant/PopularSuppliersCarousel';
import type { Intent } from '@/models/intent';
import type { SupplierOrder } from '@/models/procurement';
import { track } from '@/analytics';
import { Colors, IconSize, Radius, Spacing } from '@/theme';

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
  const { outletId } = useOutlet();

  return (
    <MandiScreen
      header={<RestaurantHeader screen={SCREEN} />}
    >
      <MandiSearchBar
        value=""
        onChangeText={() => {}}
        readOnly
        onPress={() => {
          track('open_search', { screen: SCREEN, outletId });
          router.push('/restaurant/search');
        }}
        placeholder="Search paneer, rice, oil…"
      />

      <QuickScanEntry outletId={outletId} />

      <RequestsSection outletId={outletId} />
      {/* Below requests, above orders: a request is somebody already waiting on
          this kitchen's behalf, and an order is work in hand. Browsing sits
          between them — worth offering, not worth leading with. */}
      <PopularSuppliersCarousel outletId={outletId} />
      <OrdersSection outletId={outletId} />
      <CategoriesSection outletId={outletId} />
    </MandiScreen>
  );
}


/**
 * A door to QuickScan, near the top because it is meant to be the fast path: pay
 * a shop's UPI QR without going through a request or an order at all.
 *
 * <p><b>Hidden rather than broken.</b> Loading and erroring both render nothing
 * — CLAUDE.md's "sections fail independently" cuts the other way here too: a
 * feature the outlet cannot use yet, or that this call failed to confirm, is
 * one the home screen should simply not offer rather than show disabled or
 * apologise for. `enabled` is the server's word on whether the outlet can use
 * it at all; the pay screen checks the rest (fee, balance, method) itself.
 */
function QuickScanEntry({ outletId }: { outletId: number | null }) {
  const router = useRouter();
  const { accessToken } = useSession();

  const config = useQuery({
    queryKey: ['outlet', outletId, 'quickscan-config'],
    queryFn: () => fetchQuickScanConfig(accessToken as string, outletId as number),
    enabled: outletId != null && accessToken != null,
  });

  if (config.isPending || config.error || !config.data?.enabled) return null;

  return (
    <MandiCard
      onPress={() => {
        track('open_quickscan', { screen: SCREEN, outletId });
        router.push('/restaurant/quickscan');
      }}
      accessibilityLabel="QuickScan. Pay a shop by scanning its QR."
    >
      <View style={styles.quickScanRow}>
        <View style={styles.quickScanIcon}>
          <Ionicons name="qr-code-outline" size={IconSize.md} color={Colors.primary} />
        </View>
        <View style={styles.flex}>
          <MandiText variant="bodyEmphasis">QuickScan</MandiText>
          <MandiText variant="caption" color={Colors.textSecondary}>
            Pay a shop by scanning its QR
          </MandiText>
        </View>
        <Ionicons name="chevron-forward" size={IconSize.sm} color={Colors.textTertiary} />
      </View>
    </MandiCard>
  );
}

/**
 * The one thing about the open requests worth a line.
 *
 * <p><b>Answered first, and only that.</b> A reply you have not ordered against
 * has your own deadline running on it; a request nobody has answered is the
 * supplier's clock, not yours. So when both exist the answered ones are what a
 * kitchen needs to see, and "3 requests" on its own tells them nothing about
 * which needs them now.
 *
 * <p>One clause rather than both, because two wrap onto a second line at phone
 * width — and a subtitle that wraps drags the icon and the action out of line
 * with the title they belong to.
 */
function requestsSubtitle(live: Intent[]): string | undefined {
  if (live.length === 0) return undefined;

  const replied = live.filter((intent) => intent.status === 'RESPONSES_RECEIVED').length;
  if (replied > 0) {
    return `${replied} ready to order`;
  }
  return `${live.length} awaiting a reply`;
}

/**
 * Where the active orders have got to.
 *
 * <p>Counted by what a kitchen is actually waiting for — somebody to start, or
 * somebody to arrive — rather than listing every status, which would put the
 * whole state machine in a subtitle.
 */
function ordersSubtitle(active: SupplierOrder[]): string | undefined {
  if (active.length === 0) return undefined;

  const onTheWay = active.filter((order) => order.status === 'OUT_FOR_DELIVERY').length;
  const ready = active.filter((order) => order.status === 'READY_FOR_PICKUP').length;

  if (onTheWay > 0) return `${onTheWay} on the way`;
  if (ready > 0) return `${ready} ready to collect`;
  return 'Being prepared';
}

/**
 * Requests still waiting on somebody.
 *
 * <p>Open ones first, then replies that can still be ordered from — the second
 * group has a deadline attached, which makes it the more urgent of the two even
 * though it looks like progress.
 */
/**
 * <p><b>The header action is "New request", not "See all".</b> The Requests tab
 * is already one tap away in the bar below, while starting a request had no
 * route from this screen at all. A header slot spent on a second door to the
 * same room buys nothing; spent on the thing this section exists to produce, it
 * does. It goes to Discover, because a request starts by finding a pack.
 */
function RequestsSection({ outletId }: { outletId: number | null }) {
  const router = useRouter();
  const { accessToken } = useSession();

  const query = useQuery({
    queryKey: intentsKey(outletId),
    queryFn: () => fetchIntents(accessToken as string, outletId as number),
    enabled: outletId != null && accessToken != null,
  });

  const live = (query.data ?? []).filter(
    (intent) => intent.status === 'OPEN' || intent.status === 'RESPONSES_RECEIVED',
  );

  return (
    <View style={styles.section}>
      <MandiSectionHeader
        title="Open Requests"
        count={live.length}
        subtitle={requestsSubtitle(live)}
        actionLabel="New request"
        onAction={() => {
          track('start_request', { screen: SCREEN, outletId });
          router.push('/restaurant/(tabs)/discover');
        }}
      />
      {query.isPending ? (
        <MandiSkeletonList count={2} />
      ) : query.error ? (
        <MandiErrorState message="Couldn't load requests." onRetry={() => query.refetch()} />
      ) : live.length === 0 ? (
        <MandiEmptyState
          compact
          icon="document-text-outline"
          title="Nothing outstanding"
          description="Requests you send show here until you order from them."
        />
      ) : (
        live.slice(0, 3).map((intent) => (
          <RestaurantRequestCard key={intent.id} request={intent} />
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
    (order) => !['DRAFT', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED']
      .includes(order.status),
  );

  return (
    <View style={styles.section}>
      <MandiSectionHeader
        title="Active Orders"
        count={active.length}
        subtitle={ordersSubtitle(active)}
        actionLabel={active.length > 3 ? 'See all' : undefined}
        onAction={() => router.push('/restaurant/(tabs)/orders')}
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
            onPress={() => router.push(`/restaurant/orders/${order.id}`)}
            accentColor={toneColors(resolveStatus(SupplierOrderStatus, order.status).tone).fg}
          >
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
              amount={order.totalAmount}
              status={resolveStatus(SupplierOrderStatus, order.status)}
            />
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
              router.push(`/restaurant/category/${category.id}`);
            }}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.listGap },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  flex: { flex: 1 },
  quickScanRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  quickScanIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryLight,
  },
});
