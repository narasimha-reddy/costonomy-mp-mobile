import React from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useIsFocused, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOptionalOutlet } from '@/contexts/OutletProvider';
import { useRealtime } from '@/contexts/RealtimeProvider';
import { fetchDelivery, reassignDelivery, switchToOwnDelivery } from '@/services/delivery';
import { fetchSupplierOrder } from '@/services/procurement';
import { DeliveryTimeline } from '@/components/delivery/DeliveryTimeline';
import { OrderSummaryCard } from '@/components/delivery/OrderSummaryCard';
import { TrackingCards } from '@/components/delivery/TrackingCards';
import { SandboxControlCard } from '@/components/delivery/SandboxControlCard';
import { useSandboxAdvance } from '@/hooks/useSandboxAdvance';
import { BuyerTrackingLayout } from '@/components/delivery/BuyerTrackingLayout';
import { TrackingSheet } from '@/components/delivery/TrackingSheet';
import { TrackingTopArea } from '@/components/delivery/TrackingTopArea';
import { CollapsibleSection } from '@/components/order/CollapsibleSection';
import {
  MandiButton,
  MandiChatAction,
  MandiConfirm,
  MandiErrorState,
  MandiHeader,
  MandiScreen,
  MandiSkeletonList,
  MandiStickyBar,
  MandiText,
  useToast,
} from '@/components/common';
import { useServerNow } from '@/hooks/useServerNow';
import { ApiError, isApiError } from '@/lib/api/errors';
import { canRetryPartner } from '@/lib/delivery/deliveryPartner';
import { orderTrackingView } from '@/lib/delivery/orderTracking';
import { formatMoney, formatQuantity } from '@/utils/money';
import { Colors, Radius, Spacing, TrackingLayout } from '@/theme';
import { newIdempotencyKey } from '@/lib/api/client';

const ACTIVE_POLL_MS = 15_000;
/** With the socket up, this is a safety net rather than the transport. */
const BACKSTOP_POLL_MS = 60_000;
const ENDED_ORDER = ['COMPLETED', 'CANCELLED'];
const ENDED_DELIVERY = ['DELIVERED', 'CANCELLED', 'DELIVERY_FAILED'];

/**
 * Everything the restaurant's and the supplier's tracking screens share. Doc 05 §16.
 *
 * <p>The screen is a projection of what the API said. A 404 from the delivery endpoint is "no delivery yet" (one is
 * created when the supplier marks the order ready), so the hero is then driven by the order alone. Both transports
 * stay: the realtime provider invalidates these queries on an event, and the interval is the floor, slowed right
 * down while the socket is up.
 */
export function TrackingScreenBody({ audience, orderId }: { audience: 'buyer' | 'supplier'; orderId: number }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { show } = useToast();
  const insets = useSafeAreaInsets();
  const { accessToken } = useSession();
  // The supplier's routes have no OutletProvider; only the buyer's map needs the outlet.
  const outlet = useOptionalOutlet()?.outlet;
  const { transport } = useRealtime();
  const nowMs = useServerNow();
  const buyer = audience === 'buyer';
  const enabled = Number.isFinite(orderId) && accessToken != null;
  // A tracking screen left underneath another one stops polling; coming back refetches (the query is stale by then).
  const focused = useIsFocused();
  const pollMs = transport === 'socket' ? BACKSTOP_POLL_MS : ACTIVE_POLL_MS;
  const livePollMs = buyer && !focused ? false : pollMs;

  const order = useQuery({
    queryKey: ['supplier-order', orderId],
    queryFn: () => fetchSupplierOrder(accessToken as string, orderId),
    enabled,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status != null && ENDED_ORDER.includes(status) ? false : livePollMs;
    },
  });

  const delivery = useQuery({
    queryKey: ['supplier-order', orderId, 'delivery'],
    queryFn: () => fetchDelivery(accessToken as string, orderId),
    enabled,
    // A 404 means no delivery exists yet. Retrying it is pointless and would make "finding a partner" look like a
    // failing screen.
    retry: (count, error) => !isApiError(error) && count < 2,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status != null && ENDED_DELIVERY.includes(status)) return false;
      const orderStatus = order.data?.status;
      if (status == null && orderStatus != null && ENDED_ORDER.includes(orderStatus)) return false;
      return livePollMs;
    },
  });

  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['supplier-order', orderId] });
  };
  const refuse = (caught: unknown, fallback: string) => {
    show(caught instanceof ApiError ? caught.message : fallback, 'error');
    refreshAll();
  };

  const retry = useMutation({
    mutationFn: (deliveryId: number) => reassignDelivery(accessToken as string, deliveryId, newIdempotencyKey()),
    onSuccess: (next) => {
      refreshAll();
      show(canRetryPartner(next.mode, next.status) ? 'Still no partner available' : 'Delivery partner requested',
        canRetryPartner(next.mode, next.status) ? 'info' : 'success');
    },
    onError: (caught) => refuse(caught, 'Could not request another partner.'),
  });
  const [confirmingOwn, setConfirmingOwn] = React.useState(false);
  const switchOwn = useMutation({
    mutationFn: (deliveryId: number) => switchToOwnDelivery(accessToken as string, deliveryId, newIdempotencyKey()),
    onSuccess: () => {
      refreshAll();
      show('You are delivering this order', 'success');
    },
    onError: (caught) => refuse(caught, 'Could not switch to your own delivery.'),
  });

  const sandbox = useSandboxAdvance(orderId);

  const data = delivery.data ?? null;
  const noDeliveryYet = delivery.error != null && isApiError(delivery.error);
  const o = order.data;

  const header = buyer
    ? <MandiHeader title="Tracking" subtitle={o?.orderNumber} back />
    : (
      <MandiHeader
        title="Delivery Tracking"
        subtitle={o?.orderNumber ?? `Order #${orderId}`}
        back
        fallbackHref={`/supplier/orders/${orderId}`}
      />
    );
  const onRefresh = () => {
    void order.refetch();
    void delivery.refetch();
  };

  if (order.isPending || (delivery.isPending && !noDeliveryYet)) {
    return <MandiScreen header={header}><MandiSkeletonList count={2} /></MandiScreen>;
  }
  if (o == null || (delivery.error != null && !noDeliveryYet && data == null)) {
    return (
      <MandiScreen header={header}>
        <MandiErrorState message="Couldn't load tracking." onRetry={onRefresh} />
      </MandiScreen>
    );
  }

  const view = orderTrackingView({ audience, order: o, delivery: data, nowMs });
  const destination = buyer && outlet?.latitude != null && outlet?.longitude != null
    ? { latitude: Number(outlet.latitude), longitude: Number(outlet.longitude) }
    : null;
  const itemCount = o.items.length;
  const summary = `${itemCount} ${itemCount === 1 ? 'item' : 'items'} · ${formatMoney(o.totalAmount)}`;
  const receive = () => router.push(`/restaurant/receiving/${orderId}`);
  const back = () => (router.canGoBack()
    ? router.back()
    : router.replace((buyer ? '/restaurant/orders' : `/supplier/orders/${orderId}`) as never));
  const deliveringTo = data?.dropAddress ?? [o.outletName, o.outletLocality].filter(Boolean).join(', ');
  const chat = {
    outletId: o.outletId,
    supplierStoreId: o.supplierStoreId,
    side: buyer ? 'RESTAURANT' as const : 'SUPPLIER' as const,
    orderId: o.id,
  };

  const helpPill = (
    <MandiChatAction outletId={chat.outletId} supplierStoreId={chat.supplierStoreId} side={chat.side}
      suggest={{ type: 'ORDER', id: chat.orderId }}>
      {({ onPress, label }) => (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={label}
          hitSlop={Spacing.xs}
          style={styles.help}
        >
          <MandiText variant="captionEmphasis">Help</MandiText>
        </Pressable>
      )}
    </MandiChatAction>
  );
  const buyerLayout = buyer;
  const draft = buyer && o.status === 'DRAFT';

  return (
    <View style={styles.root}>
      {buyerLayout ? (
        <BuyerTrackingLayout
          order={o}
          delivery={data}
          view={view}
          nowMs={nowMs}
          outlet={destination}
          onRefresh={onRefresh}
          refreshing={delivery.isRefetching || order.isRefetching}
          onBack={back}
          help={helpPill}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl
              refreshing={delivery.isRefetching || order.isRefetching}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
        >
          <TrackingTopArea
            view={view}
            delivery={data}
            destination={destination}
            height={TrackingLayout.topHeight + insets.top}
            insetTop={insets.top}
            onBack={back}
            help={helpPill}
          />
          <TrackingSheet>
            <TrackingCards
              audience={audience}
              view={view}
              delivery={data}
              nowMs={nowMs}
              onReport={buyer ? () => router.push(`/restaurant/dispute/${orderId}`) : undefined}
              onRetry={data == null ? undefined : () => retry.mutate(data.id)}
              onSwitchOwn={data == null ? undefined : () => setConfirmingOwn(true)}
              retrying={retry.isPending}
              switching={switchOwn.isPending}
            />
            {!buyer && <SandboxControlCard delivery={data} onAdvance={sandbox.advance} pending={sandbox.pending} />}
            <OrderSummaryCard
              orderNumber={o.orderNumber}
              summary={summary}
              lines={o.items.map((item) => ({
                id: item.id,
                name: item.productName,
                quantity: formatQuantity(item.acceptedQuantity ?? item.requestedQuantity, item.unit),
              }))}
              total={formatMoney(o.totalAmount)}
              deliveringTo={deliveringTo}
              chat={chat}
            />
            {data != null && data.timeline.length > 0 && (
              <CollapsibleSection
                title="Activity"
                summary={`${data.timeline.length} ${data.timeline.length === 1 ? 'update' : 'updates'}`}
              >
                <DeliveryTimeline events={data.timeline} />
              </CollapsibleSection>
            )}
          </TrackingSheet>
        </ScrollView>
      )}

      {draft ? (
        <MandiStickyBar>
          <MandiButton label="Pay now" size="lg" onPress={() => router.push(`/restaurant/pay/${orderId}`)} />
        </MandiStickyBar>
      ) : buyer && view.showReceive ? (
        <MandiStickyBar>
          <MandiButton label="Check in delivery" size="lg" onPress={receive} />
        </MandiStickyBar>
      ) : !buyer ? (
        <MandiStickyBar>
          <MandiButton label="Back to order" variant="neutral" size="md" onPress={back} />
        </MandiStickyBar>
      ) : null}

      <MandiConfirm
        visible={confirmingOwn}
        title="Deliver this order yourself?"
        message="The restaurant has already paid the delivery charge and it stays unchanged. You will dispatch the goods and confirm delivery yourself."
        confirmLabel="Yes, I'll deliver"
        cancelLabel="Not now"
        onConfirm={() => {
          setConfirmingOwn(false);
          if (data) switchOwn.mutate(data.id);
        }}
        onCancel={() => setConfirmingOwn(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1 },
  help: {
    minHeight: 36,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
