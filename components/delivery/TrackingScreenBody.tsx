import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useIsFocused, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOptionalOutlet } from '@/contexts/OutletProvider';
import { useRealtime } from '@/contexts/RealtimeProvider';
import { fetchDelivery, reassignDelivery, switchToOwnDelivery } from '@/services/delivery';
import { fetchSupplierOrder } from '@/services/procurement';
import { SandboxControlCard } from '@/components/delivery/SandboxControlCard';
import { useSandboxAdvance } from '@/hooks/useSandboxAdvance';
import { PartnerSearchPanel } from '@/components/delivery/PartnerSearchPanel';
import { BuyerTrackingLayout } from '@/components/delivery/BuyerTrackingLayout';
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
import { ACTIVE_POLL_MS, BACKSTOP_POLL_MS, trackingPollMs } from '@/lib/delivery/trackingPoll';
import { Colors, Radius, Spacing } from '@/theme';
import { newIdempotencyKey } from '@/lib/api/client';

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
  const livePollMs = focused ? pollMs : false;

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
      // A moving partner is refetched at the rider-fix pace so the truck does not jump once per 15 s.
      return trackingPollMs({ status, mode: query.state.data?.mode, focused, socket: transport === 'socket' });
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
        title="Delivery tracking"
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
  const receive = () => router.push(`/restaurant/receiving/${orderId}`);
  const back = () => (router.canGoBack()
    ? router.back()
    : router.replace((buyer ? '/restaurant/orders' : `/supplier/orders/${orderId}`) as never));
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
  // The supplier's search card: how far the automatic search is, or the way forward once it has stopped.
  const showSearch = !buyer && (view.search != null || (data != null && canRetryPartner(data.mode, data.status)));
  const draft = buyer && o.status === 'DRAFT';

  return (
    <View style={styles.root}>
      <BuyerTrackingLayout
        audience={audience}
        order={o}
        delivery={data}
        view={view}
        nowMs={nowMs}
        outlet={destination}
        onRefresh={onRefresh}
        refreshing={delivery.isRefetching || order.isRefetching}
        onBack={back}
        help={helpPill}
        extras={buyer ? undefined : (
          <>
            {showSearch && (
              <PartnerSearchPanel
                audience="supplier"
                delivery={data}
                nowMs={nowMs}
                onRetry={data == null ? undefined : () => retry.mutate(data.id)}
                onSwitchOwn={data == null ? undefined : () => setConfirmingOwn(true)}
                retrying={retry.isPending}
                switching={switchOwn.isPending}
              />
            )}
            <SandboxControlCard delivery={data} onAdvance={sandbox.advance} pending={sandbox.pending} />
          </>
        )}
      />

      {draft ? (
        <MandiStickyBar>
          <MandiButton label="Pay now" size="lg" onPress={() => router.push(`/restaurant/pay/${orderId}`)} />
        </MandiStickyBar>
      ) : buyer && view.showReceive ? (
        <MandiStickyBar>
          <MandiButton label="Check in delivery" size="lg" onPress={receive} />
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
