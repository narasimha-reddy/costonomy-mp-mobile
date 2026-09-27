import React from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useRealtime } from '@/contexts/RealtimeProvider';
import { fetchDelivery, fetchDeliveryEvents } from '@/services/delivery';
import { fetchSupplierOrder } from '@/services/procurement';
import { MandiMap } from '@/components/delivery/MandiMap';
import { DeliveryTimeline } from '@/components/delivery/DeliveryTimeline';
import {
  MandiButton,
  MandiCard,
  MandiEmptyState,
  MandiErrorState,
  MandiHeader,
  MandiScreen,
  MandiSkeletonList,
  MandiStatusChip,
  MandiText,
} from '@/components/common';
import { isApiError } from '@/lib/api/errors';
import { resolveStatus, DeliveryStatus as DeliveryStatusRegistry } from '@/models/status';
import { formatMoney } from '@/utils/money';
import { Colors, Radius, Spacing } from '@/theme';

const ACTIVE_POLL_MS = 10_000;
const BACKSTOP_POLL_MS = 60_000;

export default function SupplierTrackingScreen() {
  const router = useRouter();
  const { orderId: raw } = useLocalSearchParams<{ orderId: string }>();
  const orderId = Number(raw);
  const { accessToken } = useSession();
  const { transport } = useRealtime();

  const order = useQuery({
    queryKey: ['supplier-order', orderId],
    queryFn: () => fetchSupplierOrder(accessToken as string, orderId),
    enabled: Number.isFinite(orderId) && accessToken != null,
  });

  const delivery = useQuery({
    queryKey: ['supplier-order', orderId, 'delivery'],
    queryFn: () => fetchDelivery(accessToken as string, orderId),
    enabled: Number.isFinite(orderId) && accessToken != null,
    retry: (count, error) => !isApiError(error) && count < 2,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status != null && ['DELIVERED', 'CANCELLED', 'DELIVERY_FAILED'].includes(status)) {
        return false;
      }
      return transport === 'socket' ? BACKSTOP_POLL_MS : ACTIVE_POLL_MS;
    },
  });

  const events = useQuery({
    queryKey: ['delivery-events', delivery.data?.id],
    queryFn: () => fetchDeliveryEvents(accessToken as string, delivery.data!.id),
    enabled: delivery.data?.id != null && accessToken != null,
  });

  const data = delivery.data;
  const notYet = delivery.error != null && isApiError(delivery.error);

  const destination = null;

  return (
    <MandiScreen
      header={
        <MandiHeader
          title="Delivery Tracking"
          subtitle={order.data?.orderNumber ?? `Order #${orderId}`}
          back
          fallbackHref={`/supplier/orders/${orderId}`}
        />
      }
      onRefresh={() => {
        void order.refetch();
        void delivery.refetch();
        void events.refetch();
      }}
      refreshing={delivery.isRefetching}
    >
      {delivery.isPending && !notYet ? (
        <MandiSkeletonList count={2} />
      ) : notYet ? (
        <MandiEmptyState
          icon="bicycle-outline"
          title="No Delivery Dispatched Yet"
          description="A delivery partner has not been requested for this order yet."
          actionLabel="Back to Order"
          onAction={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace(`/supplier/orders/${orderId}` as any);
            }
          }}
        />
      ) : delivery.error || data == null ? (
        <MandiErrorState message="Couldn't load tracking." onRetry={() => delivery.refetch()} />
      ) : (
        <>
          <MandiCard accentColor={statusAccent(data.status)}>
            <View style={styles.heroRow}>
              <View style={styles.heroText}>
                <MandiText variant="caption" color={Colors.textTertiary}>
                  Delivering to
                </MandiText>
                <MandiText variant="title">
                  {order.data?.outletName ?? 'Restaurant Outlet'}
                </MandiText>
                <MandiText variant="caption" color={Colors.textSecondary}>
                  {data.dropAddress ?? 'Destination pending'}
                </MandiText>
                <MandiText variant="caption" color={Colors.textSecondary} style={{ marginTop: 4 }}>
                  {routeStatusSummary(data)}
                </MandiText>
              </View>
              <MandiStatusChip {...resolveStatus(DeliveryStatusRegistry, data.status)} size="sm" />
            </View>

            <View style={styles.summaryGrid}>
              <SummaryPill
                label="ETA"
                value={data.etaMinutes != null ? `~${data.etaMinutes} min` : 'Pending'}
              />
              <SummaryPill
                label="Fee"
                value={data.fee != null ? formatMoney(data.fee) : 'Free'}
              />
              <SummaryPill
                label="Mode"
                value={data.mode === 'COSTONOMY' ? 'Partner Dispatch' : 'Own Delivery'}
              />
            </View>
          </MandiCard>

          {data.trackingUrl && (
            <MandiButton
              label="Open Carrier Live Tracking"
              icon="open-outline"
              variant="secondary"
              size="md"
              onPress={() => Linking.openURL(data.trackingUrl as string)}
            />
          )}

          {data.driverName && (
            <MandiCard accentColor={data.driverPhone ? Colors.info : Colors.success}>
              <View style={styles.driverRow}>
                <View style={styles.driverBadge}>
                  <Ionicons name="person-circle-outline" size={26} color={Colors.primary} />
                </View>
                <View style={styles.flex}>
                  <MandiText variant="bodyEmphasis">{data.driverName}</MandiText>
                  <MandiText variant="caption" color={Colors.textSecondary}>
                    {data.driverVehicle ?? 'Vehicle details pending'}
                  </MandiText>
                  {data.driverPhone && (
                    <MandiText variant="caption" color={Colors.textTertiary}>
                      {data.driverPhone}
                    </MandiText>
                  )}
                </View>
                {data.driverPhone && (
                  <MandiButton
                    label="Call"
                    icon="call-outline"
                    variant="secondary"
                    size="md"
                    fullWidth={false}
                    onPress={() => Linking.openURL(`tel:${data.driverPhone}`)}
                  />
                )}
              </View>
            </MandiCard>
          )}

          <MandiCard>
            <View style={styles.cardHeader}>
              <MandiText variant="bodyEmphasis">Route</MandiText>
              <MandiText variant="caption" color={Colors.textSecondary}>
                {data.etaMinutes != null ? `${data.etaMinutes} min away` : 'Status update'}
              </MandiText>
            </View>

            <View style={styles.routeCard}>
              <View style={styles.routeStop}>
                <View style={[styles.stopDot, styles.stopDotPickup]}>
                  <Ionicons name="location-outline" size={12} color={Colors.textInverse} />
                </View>
                <View style={styles.routeText}>
                  <MandiText variant="caption" color={Colors.textTertiary}>
                    Pickup Warehouse
                  </MandiText>
                  <MandiText variant="body" numberOfLines={2}>
                    {data.pickupAddress ?? 'Pickup location pending'}
                  </MandiText>
                </View>
              </View>

              <View style={styles.routeLine} />

              <View style={styles.routeStop}>
                <View style={[styles.stopDot, styles.stopDotDrop]}>
                  <Ionicons name="pin-outline" size={12} color={Colors.textInverse} />
                </View>
                <View style={styles.routeText}>
                  <MandiText variant="caption" color={Colors.textTertiary}>
                    Destination Outlet
                  </MandiText>
                  <MandiText variant="body" numberOfLines={2}>
                    {data.dropAddress ?? 'Destination pending'}
                  </MandiText>
                </View>
              </View>
            </View>
          </MandiCard>

          {data.trackable ? (
            <>
              <MandiMap
                driver={data.location}
                destination={destination}
                stale={data.locationStale}
              />
              {data.locationStale && (
                <View style={styles.staleRow}>
                  <Ionicons name="alert-circle-outline" size={16} color={Colors.warning} />
                  <MandiText variant="caption" color={Colors.warning} style={styles.flex}>
                    {data.locationAgeSeconds != null
                      ? `Last update ${Math.round(data.locationAgeSeconds / 60)} min ago.`
                      : 'Position may be out of date.'}
                  </MandiText>
                </View>
              )}
            </>
          ) : (
            <MandiCard>
              <MandiText variant="bodyEmphasis">Supplier Own Delivery</MandiText>
              <MandiText variant="caption" color={Colors.textSecondary}>
                This order is dispatched using your store's own vehicle. Live GPS tracking is not
                broadcast for internal fleet.
              </MandiText>
            </MandiCard>
          )}

          {events.data && events.data.length > 0 && (
            <MandiCard>
              <MandiText variant="bodyEmphasis" style={{ marginBottom: Spacing.sm }}>
                Timeline
              </MandiText>
              <DeliveryTimeline events={events.data} />
            </MandiCard>
          )}
        </>
      )}
    </MandiScreen>
  );
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryPill}>
      <MandiText variant="caption" color={Colors.textTertiary}>
        {label}
      </MandiText>
      <MandiText variant="bodyEmphasis">{value}</MandiText>
    </View>
  );
}

function routeStatusSummary(data: { status: string; driverName: string | null }): string {
  switch (data.status) {
    case 'DELIVERY_REQUESTED':
    case 'QUOTE_RECEIVED':
      return 'Calculating best carrier route...';
    case 'PROVIDER_SELECTED':
      return 'Finding nearest courier driver...';
    case 'DRIVER_ASSIGNED':
      return data.driverName ? `${data.driverName} is on the way to pickup` : 'Driver assigned';
    case 'DRIVER_AT_PICKUP':
      return 'Driver has arrived at the warehouse for pickup';
    case 'PICKED_UP':
    case 'IN_TRANSIT':
      return 'Order is in transit to the restaurant';
    case 'ARRIVED_AT_DESTINATION':
      return 'Driver arrived at restaurant destination';
    case 'DELIVERED':
      return 'Successfully delivered';
    case 'CANCELLED':
      return 'Delivery was cancelled';
    case 'DELIVERY_FAILED':
      return 'Delivery could not be completed';
    default:
      return data.status.replace(/_/g, ' ');
  }
}

function statusAccent(status: string): string {
  if (['DELIVERED', 'COMPLETED'].includes(status)) return Colors.success;
  if (['CANCELLED', 'DELIVERY_FAILED', 'QUOTE_FAILED'].includes(status)) return Colors.danger;
  if (['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(status)) return Colors.primary;
  return Colors.warning;
}

const styles = StyleSheet.create({
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  heroText: { flex: 1, gap: 2 },
  summaryGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderLight,
  },
  summaryPill: {
    flex: 1,
    backgroundColor: Colors.surfaceSunken,
    padding: Spacing.sm,
    borderRadius: Radius.md,
    gap: 2,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  driverBadge: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  routeCard: {
    backgroundColor: Colors.surfaceSunken,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  routeStop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  routeText: { flex: 1, gap: 2 },
  routeLine: {
    width: 2,
    height: 16,
    backgroundColor: Colors.border,
    marginLeft: 9,
    marginVertical: 2,
  },
  stopDot: {
    width: 20,
    height: 20,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopDotPickup: { backgroundColor: Colors.primary },
  stopDotDrop: { backgroundColor: Colors.success },
  staleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    padding: Spacing.sm,
    backgroundColor: Colors.warningLight,
    borderRadius: Radius.md,
  },
  flex: { flex: 1 },
});
