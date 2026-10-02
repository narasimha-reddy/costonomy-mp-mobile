import React from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { useRealtime } from '@/contexts/RealtimeProvider';
import { fetchDelivery } from '@/services/delivery';
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
import { Colors, Spacing } from '@/theme';

const ACTIVE_POLL_MS = 10_000;
/** With the socket up, this is a safety net rather than the transport. */
const BACKSTOP_POLL_MS = 60_000;

/**
 * REST-ORDER-TRACK-01. Doc 05 §16.
 *
 * <p>Before a partner is assigned this says so rather than showing an empty map.
 * A 404 from the delivery endpoint is that state, not an error: a delivery is
 * created when the supplier marks the order ready.
 *
 * <p><b>Both transports, in the order §16 gives them.</b> The realtime provider
 * invalidates this query when a delivery event arrives, so a connected socket
 * updates the screen as things happen. The interval below stays as the floor —
 * slowed right down while the socket is up, because a socket that is connected
 * but silently dead looks exactly like a quiet delivery, and this is the screen
 * where that distinction matters most.
 *
 * <p><b>Supplier own delivery is not trackable</b> and the screen says why (doc 06
 * §2) rather than showing a map that will never move.
 */
export default function TrackingScreen() {
  const router = useRouter();
  const { orderId: raw } = useLocalSearchParams<{ orderId: string }>();
  const orderId = Number(raw);
  const { accessToken } = useSession();
  const { outlet } = useOutlet();
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
    // A 404 means no delivery exists yet. Retrying it is pointless and would
    // make "finding a partner" look like a failing screen.
    retry: (count, error) => !isApiError(error) && count < 2,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status != null
        && ['DELIVERED', 'CANCELLED', 'DELIVERY_FAILED'].includes(status)) {
        return false;
      }
      return transport === 'socket' ? BACKSTOP_POLL_MS : ACTIVE_POLL_MS;
    },
  });

  const data = delivery.data;
  const notYet = delivery.error != null && isApiError(delivery.error);
  const statusSummary = data ? routeStatusSummary(data) : null;

  const destination =
    outlet?.latitude != null && outlet?.longitude != null
      ? { latitude: Number(outlet.latitude), longitude: Number(outlet.longitude) }
      : null;

  return (
    <MandiScreen
      header={<MandiHeader title="Tracking" subtitle={order.data?.orderNumber} back />}
      onRefresh={() => {
        void order.refetch();
        void delivery.refetch();
      }}
      refreshing={delivery.isRefetching}
    >
      {delivery.isPending && !notYet ? (
        <MandiSkeletonList count={2} />
      ) : notYet ? (
        <MandiEmptyState
          icon="search-outline"
          title="Finding the best delivery partner…"
          description="Your supplier is preparing the order. We assign a partner once it is ready for pickup."
        />
      ) : delivery.error || data == null ? (
        <MandiErrorState message="Couldn't load tracking." onRetry={() => delivery.refetch()} />
      ) : (
        <>
          <MandiCard accentColor={statusAccent(data.status)}>
            <View style={styles.heroRow}>
              <View style={styles.heroText}>
                <MandiText variant="caption" color={Colors.textTertiary}>Expected arrival</MandiText>
                <MandiText variant="title">
                  {data.estimatedArrivalAt ? formatClock(data.estimatedArrivalAt) : data.etaMinutes != null ? `~${data.etaMinutes} min` : 'Pending'}
                </MandiText>
                <MandiText variant="caption" color={Colors.textSecondary}>
                  {data.dropAddress ?? 'Destination pending'}
                </MandiText>
                {statusSummary && (
                  <MandiText variant="caption" color={isDelayed(data) ? Colors.warning : Colors.textSecondary}>
                    {statusSummary}
                  </MandiText>
                )}
              </View>
              <MandiStatusChip {...resolveStatus(DeliveryStatusRegistry, data.status)} size="sm" />
            </View>

            <View style={styles.summaryGrid}>
              <SummaryPill label="ETA" value={data.etaMinutes != null ? `${data.etaMinutes} min` : 'Pending'} />
              <SummaryPill label="Last updated" value={lastUpdatedLabel(data)} />
              <SummaryPill label="Mode" value={data.mode === 'COSTONOMY' ? 'Costonomy' : 'Supplier'} />
            </View>
          </MandiCard>

          <View style={styles.actionButtonGroup}>
            <MandiButton
              label="View all deliveries"
              variant="secondary"
              size="md"
              onPress={() => router.push('/restaurant/deliveries')}
            />
            {data.trackingUrl && (
              <MandiButton
                label="Carrier live tracking"
                icon="open-outline"
                variant="secondary"
                size="md"
                onPress={() => Linking.openURL(data.trackingUrl as string)}
              />
            )}
          </View>

          <MandiCard>
            <View style={styles.cardHeader}>
              <MandiText variant="bodyEmphasis">Route</MandiText>
              <MandiText variant="caption" color={Colors.textSecondary}>
                {data.etaMinutes != null ? `${data.etaMinutes} min away` : 'Awaiting ETA'}
              </MandiText>
            </View>

            <View style={styles.routeSummaryRow}>
              <Ionicons name="navigate-outline" size={16} color={Colors.primary} />
              <MandiText variant="caption" color={Colors.textSecondary}>
                {data.driverName ? `${data.driverName} is taking this route` : 'Driver assignment pending'}
              </MandiText>
            </View>

            <View style={styles.routeCard}>
              <View style={styles.routeStop}>
                <View style={[styles.stopDot, styles.stopDotPickup]}>
                  <Ionicons name="location-outline" size={12} color={Colors.textInverse} />
                </View>
                <View style={styles.routeText}>
                  <MandiText variant="caption" color={Colors.textTertiary}>Pickup</MandiText>
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
                  <MandiText variant="caption" color={Colors.textTertiary}>Destination</MandiText>
                  <MandiText variant="body" numberOfLines={2}>
                    {data.dropAddress ?? 'Destination pending'}
                  </MandiText>
                </View>
              </View>
            </View>
          </MandiCard>

          {!data.trackable ? (
            <MandiEmptyState
              compact
              icon="car-outline"
              title="Your supplier is delivering this themselves"
              description="There is no live position for a supplier's own vehicle. They will call on arrival."
            />
          ) : (
            <>
              <MandiMap driver={data.location} destination={destination} stale={data.locationStale} />
              {data.locationStale && (
                <View style={styles.staleRow}>
                  <Ionicons name="alert-circle-outline" size={16} color={Colors.warning} />
                  <MandiText variant="caption" color={Colors.warning} style={styles.flex}>
                    {data.locationAgeSeconds != null
                      ? `Last update ${Math.round(data.locationAgeSeconds / 60)} min ago. The driver may have moved since.`
                      : 'This position may be out of date.'}
                  </MandiText>
                </View>
              )}
            </>
          )}

          {data.driverName && (
            <MandiCard accentColor={data.driverPhone ? Colors.info : Colors.success}>
              <View style={styles.driverRow}>
                <View style={styles.driverBadge}>
                  <Ionicons name="person-circle-outline" size={22} color={Colors.primary} />
                </View>
                <View style={styles.flex}>
                  <MandiText variant="bodyEmphasis">{data.driverName}</MandiText>
                  <MandiText variant="caption" color={Colors.textSecondary}>
                    {data.driverVehicle ?? 'Vehicle details pending'}
                  </MandiText>
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
              <View style={styles.driverMetaRow}>
                <SummaryPill label="Status" value={routeStatusSummary(data)} />
                <SummaryPill label="Updated" value={lastUpdatedLabel(data)} />
              </View>
            </MandiCard>
          )}

          {isDelayed(data) && (
            <MandiCard accentColor={Colors.warning}>
              <View style={styles.exceptionRow}>
                <Ionicons name="time-outline" size={18} color={Colors.warning} />
                <View style={styles.flex}>
                  <MandiText variant="bodyEmphasis">Delivery delay</MandiText>
                  <MandiText variant="caption" color={Colors.textSecondary}>
                    Expected arrival was {formatClock(data.estimatedArrivalAt ?? new Date().toISOString())}. The driver may be behind schedule.
                  </MandiText>
                </View>
              </View>
            </MandiCard>
          )}

          {(data.failureReason || data.failureCode) && (
            <MandiCard accentColor={Colors.danger}>
              <MandiText variant="bodyEmphasis">Delivery problem</MandiText>
              <MandiText variant="caption" color={Colors.textSecondary}>
                {data.failureReason ?? data.failureCode}
              </MandiText>
            </MandiCard>
          )}

          {data.status === 'DELIVERED' && (
            <MandiCard accentColor={Colors.success}>
              <View style={styles.exceptionRow}>
                <Ionicons name="checkbox-outline" size={20} color={Colors.success} />
                <View style={styles.flex}>
                  <MandiText variant="bodyEmphasis">Order delivered at dock</MandiText>
                  <MandiText variant="caption" color={Colors.textSecondary}>
                    Verify quantities, inspect for damages, and confirm receiving check-in.
                  </MandiText>
                </View>
              </View>
              <MandiButton
                label="Inspect and receive goods"
                size="md"
                onPress={() => router.push(`/restaurant/receiving/${orderId}`)}
              />
            </MandiCard>
          )}

          <MandiCard>
            <View style={styles.cardHeader}>
              <MandiText variant="bodyEmphasis">Progress</MandiText>
            </View>
            <DeliveryProgress status={data.status} />
          </MandiCard>

          <MandiCard>
            <View style={styles.cardHeader}>
              <MandiText variant="bodyEmphasis">Timeline</MandiText>
              {data.timeline[0] && (
                <MandiText variant="caption" color={Colors.textSecondary}>
                  {new Date(data.timeline[0].occurredAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </MandiText>
              )}
            </View>
            <DeliveryTimeline events={data.timeline} />
          </MandiCard>
        </>
      )}
    </MandiScreen>
  );
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryPill}>
      <MandiText variant="caption" color={Colors.textTertiary}>{label}</MandiText>
      <MandiText variant="bodyEmphasis">{value}</MandiText>
    </View>
  );
}

function statusAccent(status: string): string {
  const tone = resolveStatus(DeliveryStatusRegistry, status).tone;
  switch (tone) {
    case 'success': return Colors.success;
    case 'warning': return Colors.warning;
    case 'danger': return Colors.danger;
    case 'info': return Colors.info;
    case 'pending': return Colors.primary;
    case 'live': return Colors.deliveryLive;
    case 'neutral':
    default: return Colors.textTertiary;
  }
}

function routeStatusSummary(data: { status: string; etaMinutes?: number | null; estimatedArrivalAt?: string | null; driverName?: string | null }): string {
  if (['DELIVERED', 'CANCELLED', 'DELIVERY_FAILED'].includes(data.status)) {
    return resolveStatus(DeliveryStatusRegistry, data.status).label;
  }
  if (isDelayed(data)) return 'Delayed — driver may be behind schedule';
  if (data.status === 'IN_TRANSIT') return data.etaMinutes != null ? `${data.etaMinutes} min away` : 'Driver on route';
  if (data.status === 'PICKED_UP') return 'Picked up and moving to destination';
  if (data.status === 'DRIVER_ASSIGNED') return data.driverName ? `${data.driverName} assigned` : 'Driver assigned';
  if (data.status === 'DELIVERY_REQUESTED') return 'Awaiting pickup partner';
  return data.driverName ? `${data.driverName} is en route` : 'Delivery in progress';
}

function isDelayed(data: { status: string; estimatedArrivalAt?: string | null }): boolean {
  if (['DELIVERED', 'CANCELLED', 'DELIVERY_FAILED'].includes(data.status)) return false;
  if (!data.estimatedArrivalAt) return false;
  const at = new Date(data.estimatedArrivalAt);
  if (Number.isNaN(at.getTime())) return false;
  return at.getTime() < Date.now();
}

function lastUpdatedLabel(data: { location?: { recordedAt?: string | null } | null; locationAgeSeconds?: number | null }): string {
  if (data.location?.recordedAt) {
    const seconds = Math.round((Date.now() - new Date(data.location.recordedAt).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.round(seconds / 60);
    return `${minutes} min ago`;
  }
  if (data.locationAgeSeconds != null) return `${Math.round(data.locationAgeSeconds / 60)} min ago`;
  return 'Awaiting fix';
}

function formatClock(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function DeliveryProgress({ status }: { status: string }) {
  const stages = [
    { key: 'DELIVERY_REQUESTED', label: 'Requested' },
    { key: 'DRIVER_ASSIGNED', label: 'Assigned' },
    { key: 'PICKED_UP', label: 'Picked up' },
    { key: 'IN_TRANSIT', label: 'In transit' },
    { key: 'DELIVERED', label: 'Delivered' },
  ];

  const currentIndex = Math.max(
    0,
    stages.findIndex((stage) => stage.key === status || (status === 'ARRIVED_AT_DESTINATION' && stage.key === 'IN_TRANSIT')),
  );

  return (
    <View style={styles.progressWrap}>
      {stages.map((stage, index) => {
        const isDone = index <= currentIndex;
        const isCurrent = index === currentIndex;
        return (
          <View key={stage.key} style={styles.progressStep}>
            <View style={[styles.progressDot, isDone && styles.progressDotDone, isCurrent && styles.progressDotCurrent]} />
            {index < stages.length - 1 && <View style={[styles.progressLine, isDone && styles.progressLineDone]} />}
            <MandiText
              variant={isCurrent ? 'captionEmphasis' : 'caption'}
              color={isDone ? Colors.textPrimary : Colors.textTertiary}
            >
              {stage.label}
            </MandiText>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  actionButtonGroup: {
    gap: Spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  driverBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverMetaRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  routeSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  heroText: {
    flex: 1,
    gap: 2,
  },
  summaryGrid: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: Spacing.sm,
  },
  summaryPill: {
    flex: 1,
    backgroundColor: Colors.surfaceSunken,
    borderRadius: 12,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: 2,
  },
  routeCard: {
    gap: Spacing.sm,
  },
  routeStop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  routeText: {
    flex: 1,
    gap: 2,
  },
  routeLine: {
    width: 2,
    height: 18,
    marginLeft: 9,
    backgroundColor: Colors.border,
  },
  stopDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  stopDotPickup: { backgroundColor: Colors.primary },
  stopDotDrop: { backgroundColor: Colors.success },
  staleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  exceptionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  progressWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  progressStep: {
    position: 'relative',
    flex: 1,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  progressDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.border,
  },
  progressDotDone: { backgroundColor: Colors.success },
  progressDotCurrent: { backgroundColor: Colors.primary, width: 14, height: 14, borderRadius: 7 },
  progressLine: {
    position: 'absolute',
    top: 5,
    left: '50%',
    right: -Spacing.sm,
    height: 2,
    backgroundColor: Colors.border,
    marginLeft: Spacing.sm,
  },
  progressLineDone: { backgroundColor: Colors.success },
});
