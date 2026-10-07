import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { fetchCategories } from '@/services/catalog';
import { fetchOutletOrders } from '@/services/procurement';
import { fetchIntents } from '@/services/intent';
import { fetchQuickScanConfig } from '@/services/quickscan';
import { intentsKey } from '@/lib/queryKeys';
import { QuickActionTiles, type MoneyAction } from '@/components/wallet/QuickActionTiles';
import { CategoryScroller } from '@/components/home/CategoryScroller';
import { HomeSearchRow } from '@/components/home/HomeSearchRow';
import {
  MandiCard,
  MandiEmptyState,
  MandiErrorState,
  MandiScreen,
  MandiSectionHeader,
  MandiSkeletonList,
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
import { searchHints } from '@/lib/search/hints';
import { ScanQrIcon } from '@/components/icons/ScanQrIcon';
import { ActiveOrderPill } from '@/components/delivery/ActiveOrderPill';
import { useLatestInFlight } from '@/hooks/useLatestInFlight';
import { useCreditAttention } from '@/hooks/useCreditAttention';
import { usePermissions } from '@/hooks/usePermissions';
import { Spacing } from '@/theme';

const SCREEN = 'REST-HOME-01';
const SEARCH_HINTS = searchHints();
/** Room under the content for the pill that floats over it. */
const PILL_CLEARANCE = 96;

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
  const inFlight = useLatestInFlight(outletId);

  return (
    <MandiScreen
      header={<RestaurantHeader screen={SCREEN} location />}
      contentStyle={inFlight != null ? { paddingBottom: PILL_CLEARANCE } : undefined}
      floating={inFlight != null ? (
        <ActiveOrderPill
          supplierName={inFlight.order.supplierName}
          statusText={inFlight.header.title}
          etaMins={inFlight.etaMins}
          onPress={() => router.push(`/restaurant/tracking/${inFlight.order.id}`)}
        />
      ) : undefined}
    >
      <HomeSearch outletId={outletId} />

      <CategoriesSection outletId={outletId} />

      {/* Chips and the Recommended grid. Browsing sits up top in the restyle;
          the work below (money, requests, orders) is unchanged. */}
      <PopularSuppliersCarousel outletId={outletId} />

      <QuickActions outletId={outletId} />

      <RequestsSection outletId={outletId} />
      <OrdersSection outletId={outletId} />
    </MandiScreen>
  );
}


/**
 * Search, with Quick Scan as the round side button when the outlet can use it.
 * Shares the QuickActions query key, so it is one request, not two.
 */
function HomeSearch({ outletId }: { outletId: number | null }) {
  const router = useRouter();
  const { accessToken } = useSession();
  const config = useQuery({
    queryKey: ['outlet', outletId, 'quickscan-config'],
    queryFn: () => fetchQuickScanConfig(accessToken as string, outletId as number),
    enabled: outletId != null && accessToken != null,
  });

  return (
    <HomeSearchRow
      hints={SEARCH_HINTS}
      placeholder="Search paneer, rice, oil…"
      onPressSearch={() => {
        track('open_search', { screen: SCREEN, outletId });
        router.push('/restaurant/search');
      }}
      side={config.data?.enabled === true ? {
        icon: 'qr-code-outline',
        label: 'Scan to pay',
        onPress: () => {
          track('open_quickscan', { screen: SCREEN, outletId });
          router.push('/restaurant/quickscan');
        },
      } : null}
    />
  );
}

/**
 * The "Money Transfers" section: Quick Scan, Wallet and Credit in a row of four slots.
 *
 * <p><b>QuickScan is hidden rather than broken.</b> Loading and erroring both
 * leave it out: a feature the outlet cannot use yet, or that this call failed to
 * confirm, is one Home should not offer rather than show disabled. `enabled` is
 * the server's word on whether the outlet can use it at all; the pay screen
 * checks the rest itself. Wallet then takes the first slot.
 *
 * <p>No balance here: it lives on the wallet screen, which is where Add money is.
 * More actions are one more entry in `actions`.
 */
function QuickActions({ outletId }: { outletId: number | null }) {
  const router = useRouter();
  const { accessToken } = useSession();
  const { outlet } = useOutlet();
  const { canForOutlet } = usePermissions();
  const attention = useCreditAttention();
  const mayViewCredit = canForOutlet('CREDIT_VIEW', outlet);

  const config = useQuery({
    queryKey: ['outlet', outletId, 'quickscan-config'],
    queryFn: () => fetchQuickScanConfig(accessToken as string, outletId as number),
    enabled: outletId != null && accessToken != null,
  });

  const actions: MoneyAction[] = [
    {
      key: 'quickscan',
      label: 'Quick Scan',
      icon: 'qr-code-outline',
      renderIcon: (size) => <ScanQrIcon size={size} variant="white" />,
      accessibilityLabel: 'Quick Scan. Pay a shop by scanning its QR.',
      visible: config.data?.enabled === true,
      onPress: () => {
        track('open_quickscan', { screen: SCREEN, outletId });
        router.push('/restaurant/quickscan');
      },
    },
    {
      key: 'wallet',
      label: 'Wallet',
      icon: 'wallet-outline',
      accessibilityLabel: 'Wallet',
      visible: true,
      onPress: () => {
        track('open_wallet', { screen: SCREEN, outletId });
        router.push('/restaurant/wallet');
      },
    },
    {
      key: 'credit',
      label: 'Credit',
      icon: 'card-outline',
      accessibilityLabel: attention.overdue ? 'Credit, payment overdue' : 'Credit',
      visible: mayViewCredit,
      badge: attention.overdue,
      onPress: () => {
        track('open_credit', { screen: SCREEN, outletId });
        router.push('/restaurant/credit');
      },
    },
  ];

  return <QuickActionTiles actions={actions} />;
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
  const [selectedId, setSelectedId] = useState<number | null>(null);

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
    <CategoryScroller
      categories={query.data}
      selectedId={selectedId}
      onSelect={(category) => {
        // Marked before navigating, so the underline is there on coming back.
        setSelectedId(category.id);
        track('open_category', { screen: SCREEN, outletId, entityId: category.id });
        router.push(`/restaurant/category/${category.id}`);
      }}
    />
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
});
