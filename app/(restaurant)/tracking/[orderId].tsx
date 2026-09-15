import React from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
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

/**
 * REST-ORDER-TRACK-01. Doc 05 §16.
 *
 * <p>Before a partner is assigned this says so rather than showing an empty map.
 * A 404 from the delivery endpoint is that state, not an error: a delivery is
 * created when the supplier marks the order ready.
 *
 * <p><b>Polling is the fallback, and it is what is implemented here.</b> §16 lists
 * WebSocket first, push second, polling third; the realtime channel lands with
 * M6. Polling a live delivery every ten seconds is correct behaviour in the
 * meantime — and remains the floor under the socket afterwards, because §16 also
 * requires authoritative state to be refetched on reconnect and cold start.
 *
 * <p><b>Supplier own delivery is not trackable</b> and the screen says why (doc 06
 * §2) rather than showing a map that will never move.
 */
export default function TrackingScreen() {
  const { orderId: raw } = useLocalSearchParams<{ orderId: string }>();
  const orderId = Number(raw);
  const { accessToken } = useSession();
  const { outlet } = useOutlet();

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
      if (status == null) return ACTIVE_POLL_MS;
      return ['DELIVERED', 'CANCELLED', 'DELIVERY_FAILED'].includes(status)
        ? false
        : ACTIVE_POLL_MS;
    },
  });

  const data = delivery.data;
  const notYet = delivery.error != null && isApiError(delivery.error);

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
          <MandiCard>
            <View style={styles.row}>
              <MandiText variant="bodyEmphasis">
                {data.etaMinutes != null ? `About ${data.etaMinutes} min away` : 'On its way'}
              </MandiText>
              <MandiStatusChip {...resolveStatus(DeliveryStatusRegistry, data.status)} size="sm" />
            </View>
            {data.dropAddress && (
              <MandiText variant="caption" color={Colors.textSecondary}>
                To {data.dropAddress}
              </MandiText>
            )}
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
            <MandiCard>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <MandiText variant="bodyEmphasis">{data.driverName}</MandiText>
                  {data.driverVehicle && (
                    <MandiText variant="caption" color={Colors.textSecondary}>
                      {data.driverVehicle}
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

          {(data.failureReason || data.failureCode) && (
            <MandiCard accentColor={Colors.danger}>
              <MandiText variant="bodyEmphasis">Delivery problem</MandiText>
              <MandiText variant="caption" color={Colors.textSecondary}>
                {data.failureReason ?? data.failureCode}
              </MandiText>
            </MandiCard>
          )}

          <MandiCard>
            <MandiText variant="bodyEmphasis" style={styles.timelineTitle}>Progress</MandiText>
            <DeliveryTimeline events={data.timeline} />
          </MandiCard>
        </>
      )}
    </MandiScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  staleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  timelineTitle: { marginBottom: Spacing.md },
});
