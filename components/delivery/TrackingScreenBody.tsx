import React from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { useRealtime } from '@/contexts/RealtimeProvider';
import { fetchDelivery, reassignDelivery, switchToOwnDelivery } from '@/services/delivery';
import { fetchSupplierOrder } from '@/services/procurement';
import { DeliveredSummaryCard } from '@/components/delivery/DeliveredSummaryCard';
import { DeliveryPartnerCard } from '@/components/delivery/DeliveryPartnerCard';
import { DeliveryTimeline } from '@/components/delivery/DeliveryTimeline';
import { LiveMapHeader } from '@/components/delivery/LiveMapHeader';
import { OrderProgressHero } from '@/components/delivery/OrderProgressHero';
import { PartnerSearchPanel } from '@/components/delivery/PartnerSearchPanel';
import { CollapsibleSection } from '@/components/order/CollapsibleSection';
import {
  MandiButton,
  MandiCard,
  MandiConfirm,
  MandiErrorState,
  MandiHeader,
  MandiScreen,
  MandiSkeletonList,
  MandiText,
  useToast,
} from '@/components/common';
import { useServerNow } from '@/hooks/useServerNow';
import { ApiError, isApiError } from '@/lib/api/errors';
import { canRetryPartner } from '@/lib/delivery/deliveryPartner';
import { orderTrackingView, stepTimesFromTimeline } from '@/lib/delivery/orderTracking';
import { formatMoney, formatQuantity } from '@/utils/money';
import { Colors, IconSize, MapHeight, Spacing } from '@/theme';
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
  const { accessToken } = useSession();
  const { outlet } = useOutlet();
  const { transport } = useRealtime();
  const nowMs = useServerNow();
  const buyer = audience === 'buyer';
  const enabled = Number.isFinite(orderId) && accessToken != null;
  const pollMs = transport === 'socket' ? BACKSTOP_POLL_MS : ACTIVE_POLL_MS;

  const order = useQuery({
    queryKey: ['supplier-order', orderId],
    queryFn: () => fetchSupplierOrder(accessToken as string, orderId),
    enabled,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status != null && ENDED_ORDER.includes(status) ? false : pollMs;
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
      return pollMs;
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
  const stepTimes = stepTimesFromTimeline(data?.timeline);
  const retryable = data != null && canRetryPartner(data.mode, data.status);
  const deliveredByPartner = data?.status === 'DELIVERED';
  const itemCount = o.items.length;
  const summary = `${itemCount} ${itemCount === 1 ? 'item' : 'items'} · ${formatMoney(o.totalAmount)}`;
  const receive = () => router.push(`/restaurant/receiving/${orderId}`);

  return (
    <MandiScreen header={header} onRefresh={onRefresh} refreshing={delivery.isRefetching || order.isRefetching}>
      {view.showTrack && data != null && (
        <LiveMapHeader delivery={data} destination={destination} height={MapHeight.full} />
      )}

      <MandiCard accentColor={view.tone === 'danger' ? Colors.danger : view.tone === 'warning' ? Colors.warning : undefined}>
        <OrderProgressHero view={view} orientation="vertical" stepTimes={stepTimes} />
      </MandiCard>

      {(view.search != null || (view.showFailure && retryable)) && (
        <PartnerSearchPanel
          audience={audience}
          delivery={data}
          nowMs={nowMs}
          onRetry={buyer || data == null ? undefined : () => retry.mutate(data.id)}
          onSwitchOwn={buyer || data == null ? undefined : () => setConfirmingOwn(true)}
          retrying={retry.isPending}
          switching={switchOwn.isPending}
        />
      )}

      {view.showPartner && data?.driverName != null && (
        <DeliveryPartnerCard
          name={data.driverName}
          vehicle={data.driverVehicle}
          phone={data.driverPhone}
          showCall={view.showCall}
        />
      )}

      {view.showTrack && data?.trackingUrl != null && (
        <MandiButton
          label="Open live tracking"
          icon="open-outline"
          variant="secondary"
          size="md"
          onPress={() => { void Linking.openURL(data.trackingUrl as string); }}
        />
      )}

      {deliveredByPartner ? (
        <DeliveredSummaryCard
          audience={audience}
          deliveredAt={data.deliveredAt}
          driverName={data.driverName}
          onReceive={view.showReceive ? receive : undefined}
        />
      ) : view.showReceive ? (
        <MandiCard accentColor={Colors.success}>
          <MandiButton label="Inspect and receive goods" size="md" onPress={receive} />
        </MandiCard>
      ) : null}

      {data != null && (data.pickupAddress != null || data.dropAddress != null) && (
        <MandiCard>
          <MandiText variant="bodyEmphasis">Route</MandiText>
          <View style={styles.stop}>
            <Ionicons name="location-outline" size={IconSize.md} color={Colors.primary} />
            <View style={styles.flex}>
              <MandiText variant="caption" color={Colors.textTertiary}>{buyer ? 'Pickup' : 'Pickup from your store'}</MandiText>
              <MandiText variant="body" numberOfLines={2}>{data.pickupAddress ?? 'Pickup location pending'}</MandiText>
            </View>
          </View>
          <View style={styles.stop}>
            <Ionicons name="pin-outline" size={IconSize.md} color={Colors.success} />
            <View style={styles.flex}>
              <MandiText variant="caption" color={Colors.textTertiary}>{buyer ? 'Your outlet' : 'Delivering to'}</MandiText>
              <MandiText variant="body" numberOfLines={2}>{data.dropAddress ?? 'Destination pending'}</MandiText>
            </View>
          </View>
        </MandiCard>
      )}

      <CollapsibleSection key={`summary-${view.terminal}`} title="Order summary" summary={summary} defaultOpen={view.terminal}>
        {o.items.map((item) => (
          <View key={item.id} style={styles.line}>
            <MandiText variant="body" style={styles.flex} numberOfLines={2}>{item.productName}</MandiText>
            <MandiText variant="caption" color={Colors.textSecondary}>{formatQuantity(item.acceptedQuantity ?? item.requestedQuantity, item.unit)}</MandiText>
          </View>
        ))}
        <View style={styles.line}>
          <MandiText variant="bodyEmphasis">Total</MandiText>
          <MandiText variant="bodyEmphasis">{formatMoney(o.totalAmount)}</MandiText>
        </View>
      </CollapsibleSection>

      {data != null && data.timeline.length > 0 && (
        <CollapsibleSection
          title="Activity"
          summary={`${data.timeline.length} ${data.timeline.length === 1 ? 'update' : 'updates'}`}
        >
          <DeliveryTimeline events={data.timeline} />
        </CollapsibleSection>
      )}

      {!buyer && data == null && (
        <MandiButton
          label="Back to order"
          variant="tertiary"
          size="md"
          onPress={() => (router.canGoBack() ? router.back() : router.replace(`/supplier/orders/${orderId}` as never))}
        />
      )}

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
    </MandiScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, marginTop: Spacing.md },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md, paddingVertical: Spacing.xs },
});
