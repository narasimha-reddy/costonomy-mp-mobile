import React, { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import {
  MandiButton,
  MandiCard,
  FilterPills,
  MandiEmptyState,
  MandiErrorState,
  MandiHeader,
  MandiScreen,
  MandiSearchBar,
  MandiSkeletonList,
  MandiStatusChip,
  MandiText,
} from '@/components/common';
import { partnerWording } from '@/lib/delivery/partnerWording';
import { resolveStatus, DeliveryStatus as DeliveryStatusRegistry } from '@/models/status';
import {
  fetchOutletDeliveries,
  fetchOutletDeliveryRadar,
} from '@/services/delivery';
import type { KitchenAction, OutletDeliveryRadarItem, RadarSummary } from '@/models/delivery';
import { Colors, Radius, Spacing } from '@/theme';

type DeliveryFilter = 'radar' | 'late' | 'check_in' | 'all';

const FILTERS: { key: DeliveryFilter; label: string }[] = [
  { key: 'radar', label: 'Active' },
  { key: 'late', label: 'Late' },
  { key: 'check_in', label: 'Needs check-in' },
  { key: 'all', label: 'All' },
];

export default function DeliveriesScreen() {
  const router = useRouter();
  const { accessToken } = useSession();
  const { outletId, outlet } = useOutlet();
  const [filter, setFilter] = useState<DeliveryFilter>('radar');
  const [search, setSearch] = useState('');

  const isHistory = filter === 'all';

  // Radar query for active situational delivery tracking
  const radarQuery = useQuery({
    queryKey: ['outlet-delivery-radar', outletId, filter],
    queryFn: () => {
      const options =
        filter === 'late'
          ? { scheduleStatus: 'RUNNING_LATE' as const }
          : filter === 'check_in'
            ? { action: 'CHECK_IN' as const }
            : {};
      return fetchOutletDeliveryRadar(accessToken as string, outletId as number, options);
    },
    enabled: accessToken != null && outletId != null && !isHistory,
    refetchInterval: 15_000,
  });

  // Historical paginated list query
  const historyQuery = useQuery({
    queryKey: ['outlet-deliveries', outletId],
    queryFn: () => fetchOutletDeliveries(accessToken as string, outletId as number, { page: 0, size: 30 }),
    enabled: accessToken != null && outletId != null && isHistory,
  });

  const activeQuery = isHistory ? historyQuery : radarQuery;
  const radarData = radarQuery.data;
  const summary = radarData?.summary;

  const rawItems: OutletDeliveryRadarItem[] = isHistory
    ? (historyQuery.data?.items ?? [])
    : (radarData?.items ?? []);

  const visibleItems = rawItems.filter((item) => {
    if (!search.trim()) return true;
    const haystack = [
      item.orderNumber,
      item.supplier?.supplierStoreName,
      item.supplier?.supplierOrgName,
      item.driver?.name,
      item.driver?.vehicle,
      item.actionReason ? partnerWording(item.actionReason) : null,
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  });

  const activeFilter = FILTERS.find((entry) => entry.key === filter) ?? FILTERS[0]!;

  return (
    <MandiScreen
      header={
        <MandiHeader
          title="Deliveries"
          subtitle={outlet?.name ? `${outlet.name} · ${activeFilter.label}` : activeFilter.label}
          back
        />
      }
      onRefresh={() => activeQuery.refetch()}
      refreshing={activeQuery.isRefetching}
    >
      <MandiSearchBar
        value={search}
        onChangeText={setSearch}
        placeholder="Search order, supplier, or delivery partner"
      />

      <FilterPills
        items={FILTERS.map((entry) => ({ key: entry.key, label: entry.label, count: filterCount(entry.key, summary) }))}
        selected={filter}
        onSelect={(key) => setFilter(key as DeliveryFilter)}
      />

      {outletId == null ? (
        <MandiEmptyState
          icon="storefront-outline"
          title="No outlet selected"
          description="Select an outlet from the restaurant switcher to monitor incoming deliveries."
        />
      ) : activeQuery.isPending ? (
        <MandiSkeletonList count={3} />
      ) : activeQuery.error ? (
        <MandiErrorState message="Couldn't load deliveries." onRetry={() => activeQuery.refetch()} />
      ) : visibleItems.length === 0 ? (
        <MandiEmptyState
          icon="car-outline"
          title={
            search.trim()
              ? 'No matching deliveries'
              : filter === 'late'
                ? 'No deliveries are running late'
                : filter === 'check_in'
                  ? 'All delivered orders are checked in'
                  : 'No active deliveries right now'
          }
        />
      ) : (
        visibleItems.map((item) => {
          // The server decides lateness and how late; the app only displays it.
          const late = item.scheduleStatus !== 'ON_SCHEDULE';
          const needsCheckIn = item.recommendedAction === 'CHECK_IN' && !item.isCheckedIn;
          const delivered = item.status === 'DELIVERED' || item.arrivalStage === 'DELIVERED_UNCHECKED';
          // The rank orders arrivals among several; on its own, or once delivered, it says nothing.
          const showRank = item.arrivalRank > 0 && !isHistory && !delivered && visibleItems.length > 1;

          return (
            <MandiCard
              key={item.deliveryId}
              accentColor={needsCheckIn ? Colors.info : late ? Colors.warning : undefined}
              onPress={() => router.push(`/restaurant/tracking/${item.supplierOrderId}`)}
            >
              <View style={styles.cardTop}>
                <MandiText variant="bodyEmphasis" style={styles.flex} numberOfLines={1}>
                  {item.supplier?.supplierStoreName ?? item.supplier?.supplierOrgName ?? 'Supplier'}
                </MandiText>
                <MandiStatusChip {...resolveStatus(DeliveryStatusRegistry, item.status)} size="sm" />
              </View>

              <View style={styles.metaRow}>
                <View style={styles.orderNumberRow}>
                  <MandiText variant="caption" color={Colors.textSecondary}>
                    {`Order ${item.orderNumber}`}
                  </MandiText>
                  {showRank && (
                    <View style={styles.rankBadge} accessible accessibilityLabel={`Arrival number ${item.arrivalRank}`}>
                      <MandiText variant="captionEmphasis" color={Colors.primaryDark}>
                        Arrival #{item.arrivalRank}
                      </MandiText>
                    </View>
                  )}
                </View>
                {item.arrivalStage && !delivered && (
                  <MandiText variant="captionEmphasis" color={stageColor(item.arrivalStage)}>
                    {formatStage(item.arrivalStage)}
                  </MandiText>
                )}
              </View>

              {item.driver?.name && (
                <View style={styles.driverRow}>
                  <View style={styles.driverMeta}>
                    <Ionicons name="person-outline" size={13} color={Colors.textSecondary} />
                    <MandiText variant="caption" color={Colors.textSecondary}>
                      {item.driver.name}
                      {item.driver.vehicle ? ` · ${item.driver.vehicle}` : ''}
                    </MandiText>
                  </View>
                  {item.driver.phone && (
                    <MandiButton
                      label="Call"
                      icon="call-outline"
                      variant="secondary"
                      size="sm"
                      fullWidth={false}
                      onPress={() => Linking.openURL(`tel:${item.driver.phone}`)}
                    />
                  )}
                </View>
              )}

              <View style={styles.hairline} />
              <View style={styles.bottomRow}>
                {delivered ? (
                  <MandiText variant="body" color={Colors.textSecondary} style={styles.flex}>
                    {item.deliveredAt ? `Delivered at ${formatClock(item.deliveredAt)}` : 'Waiting for your check-in'}
                  </MandiText>
                ) : late ? (
                  <MandiText variant="bodyEmphasis" color={Colors.primaryDark} style={styles.flex}>
                    {item.minutesOverdue != null ? `${item.minutesOverdue} mins past slot` : 'Past slot'}
                  </MandiText>
                ) : item.etaMinutes != null ? (
                  <MandiText variant="bodyEmphasis" color={Colors.successText} style={styles.flex}>
                    {`Arriving in ${item.etaMinutes} mins`}
                  </MandiText>
                ) : (
                  <MandiText variant="body" color={Colors.textSecondary} style={styles.flex}>
                    {item.estimatedArrivalAt ? `Expected by ${formatClock(item.estimatedArrivalAt)}` : 'Slot to be confirmed'}
                  </MandiText>
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Track order ${item.orderNumber}`}
                  hitSlop={8}
                  style={styles.trackBtn}
                  onPress={() => router.push(`/restaurant/tracking/${item.supplierOrderId}`)}
                >
                  <MandiText variant="bodyEmphasis" color={Colors.primaryDark}>Track ›</MandiText>
                </Pressable>
              </View>

              {/* Recommended Kitchen Action: only for a delivery still moving, or one waiting for its check-in. A finished
                  one has no "progressing normally" or "running late" to tell. */}
              {item.recommendedAction && item.actionReason && (!delivered || needsCheckIn) && (
                <View style={[styles.actionBanner, actionBannerStyle(item.recommendedAction)]}>
                  <View style={styles.actionTextWrap}>
                    <Ionicons
                      name={actionIcon(item.recommendedAction)}
                      size={15}
                      color={actionColor(item.recommendedAction)}
                    />
                    <MandiText variant="captionEmphasis" color={actionColor(item.recommendedAction)}>
                      {partnerWording(item.actionReason)}
                    </MandiText>
                  </View>
                  {needsCheckIn && (
                    <MandiButton
                      label="Check-in"
                      size="sm"
                      fullWidth={false}
                      onPress={() => router.push(`/restaurant/receiving/${item.supplierOrderId}`)}
                    />
                  )}
                </View>
              )}
            </MandiCard>
          );
        })
      )}
    </MandiScreen>
  );
}

// "All" is history and has no summary count.
function filterCount(key: DeliveryFilter, summary: RadarSummary | undefined): number | null {
  if (!summary) return null;
  if (key === 'radar') return summary.totalActive;
  if (key === 'late') return summary.delayedCount;
  if (key === 'check_in') return summary.pendingCheckInCount;
  return null;
}

function formatClock(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatStage(stage: string): string {
  switch (stage) {
    case 'AT_KITCHEN_DOOR': return 'At Kitchen Door';
    case 'APPROACHING': return 'Approaching';
    case 'EN_ROUTE': return 'En Route';
    case 'AT_SUPPLIER_PICKUP': return 'At Pickup';
    case 'DRIVER_DISPATCHED': return 'Delivery Partner Dispatched';
    case 'AWAITING_DRIVER': return 'Awaiting Delivery Partner';
    case 'DELIVERED_UNCHECKED': return 'Delivered (Unchecked)';
    default: return stage.replace(/_/g, ' ');
  }
}

function stageColor(stage: string): string {
  switch (stage) {
    case 'AT_KITCHEN_DOOR': return Colors.success;
    case 'APPROACHING': return Colors.deliveryLive;
    case 'EN_ROUTE': return Colors.primary;
    default: return Colors.textSecondary;
  }
}

function actionIcon(action: KitchenAction): keyof typeof Ionicons.glyphMap {
  switch (action) {
    case 'CHECK_IN': return 'checkbox-outline';
    case 'MEET_DRIVER': return 'exit-outline';
    case 'PREPARE_DOCK': return 'cube-outline';
    case 'CALL_DRIVER': return 'call-outline';
    case 'ESCALATE': return 'alert-circle-outline';
    case 'MONITOR': return 'eye-outline';
    default: return 'information-circle-outline';
  }
}

function actionColor(action: KitchenAction): string {
  switch (action) {
    case 'CHECK_IN': return Colors.info;
    case 'MEET_DRIVER': return Colors.success;
    case 'PREPARE_DOCK': return Colors.primary;
    case 'CALL_DRIVER': return Colors.warning;
    case 'ESCALATE': return Colors.danger;
    case 'MONITOR':
    default: return Colors.textSecondary;
  }
}

function actionBannerStyle(action: KitchenAction) {
  switch (action) {
    case 'CHECK_IN': return styles.actionBannerInfo;
    case 'ESCALATE': return styles.actionBannerDanger;
    case 'CALL_DRIVER': return styles.actionBannerWarning;
    default: return styles.actionBannerNeutral;
  }
}

const styles = StyleSheet.create({
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  orderNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  rankBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.full,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: Spacing.xs,
  },
  driverMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  flex: { flex: 1 },
  hairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginTop: Spacing.sm,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    minHeight: 48,
  },
  trackBtn: {
    minHeight: 48,
    minWidth: 48,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  actionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.sm,
    marginTop: Spacing.xs,
  },
  actionTextWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flex: 1,
  },
  actionBannerInfo: {
    backgroundColor: Colors.surfaceSunken,
    borderLeftWidth: 3,
    borderLeftColor: Colors.info,
  },
  actionBannerWarning: {
    backgroundColor: Colors.surfaceSunken,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
  },
  actionBannerDanger: {
    backgroundColor: Colors.surfaceSunken,
    borderLeftWidth: 3,
    borderLeftColor: Colors.danger,
  },
  actionBannerNeutral: {
    backgroundColor: Colors.surfaceSunken,
  },
});
