import React, { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
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
      item.actionReason,
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
        placeholder="Search order, supplier, or driver"
      />

      <FilterPills
        items={FILTERS.map((entry) => ({ key: entry.key, label: entry.label, count: filterCount(entry.key, summary) }))}
        selected={filter}
        onSelect={(key) => setFilter(key as DeliveryFilter)}
      />

      {summary && !isHistory && (
        <View style={styles.summaryBar}>
          <SummaryBadge
            count={summary.atDoorCount}
            label="At Door"
            tone={summary.atDoorCount > 0 ? 'warning' : 'neutral'}
          />
          <SummaryBadge
            count={summary.approachingCount}
            label="Approaching"
            tone={summary.approachingCount > 0 ? 'primary' : 'neutral'}
          />
          <SummaryBadge
            count={summary.delayedCount}
            label="Delayed"
            tone={summary.delayedCount > 0 ? 'danger' : 'neutral'}
          />
          <SummaryBadge
            count={summary.pendingCheckInCount}
            label="Check-in"
            tone={summary.pendingCheckInCount > 0 ? 'info' : 'neutral'}
          />
        </View>
      )}

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
          description={
            search.trim()
              ? 'Try a different order number, supplier, or driver name.'
              : filter === 'late'
                ? 'All incoming deliveries are on schedule.'
                : filter === 'check_in'
                  ? 'There are no delivered orders awaiting dock verification.'
                  : 'New deliveries will appear here as soon as suppliers pack your orders.'
          }
        />
      ) : (
        visibleItems.map((item) => {
          const late = item.scheduleStatus === 'RUNNING_LATE' || item.scheduleStatus === 'CRITICALLY_DELAYED' || (item.minutesOverdue != null && item.minutesOverdue > 0);
          const needsCheckIn = item.recommendedAction === 'CHECK_IN' && !item.isCheckedIn;

          return (
            <MandiCard
              key={item.deliveryId}
              accentColor={needsCheckIn ? Colors.info : late ? Colors.warning : undefined}
              onPress={() => router.push(`/restaurant/tracking/${item.supplierOrderId}`)}
            >
              <View style={styles.cardTop}>
                <View style={styles.orderNumberRow}>
                  <MandiText variant="bodyEmphasis">{item.orderNumber}</MandiText>
                  {item.arrivalRank > 0 && !isHistory && (
                    <View style={styles.rankBadge}>
                      <MandiText variant="captionEmphasis" color={Colors.primary}>
                        #{item.arrivalRank}
                      </MandiText>
                    </View>
                  )}
                </View>
                <MandiStatusChip {...resolveStatus(DeliveryStatusRegistry, item.status)} size="sm" />
              </View>

              <View style={styles.metaRow}>
                <MandiText variant="body" color={Colors.textPrimary}>
                  {item.supplier?.supplierStoreName ?? item.supplier?.supplierOrgName ?? 'Supplier'}
                </MandiText>
                {item.arrivalStage && (
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

              <View style={styles.detailsRow}>
                <View style={styles.detailBlock}>
                  <MandiText variant="caption" color={Colors.textTertiary}>ETA</MandiText>
                  <MandiText variant="bodyEmphasis" color={late ? Colors.warning : undefined}>
                    {late
                      ? `${item.minutesOverdue ?? 0}m overdue`
                      : item.etaMinutes != null
                        ? `${item.etaMinutes} min`
                        : 'Pending'}
                  </MandiText>
                </View>
                <View style={styles.detailBlock}>
                  <MandiText variant="caption" color={Colors.textTertiary}>Expected</MandiText>
                  <MandiText variant="bodyEmphasis">
                    {item.estimatedArrivalAt ? formatClock(item.estimatedArrivalAt) : '—'}
                  </MandiText>
                </View>
                <View style={styles.detailBlock}>
                  <MandiText variant="caption" color={Colors.textTertiary}>Freshness</MandiText>
                  <MandiText variant="caption" color={item.locationStale ? Colors.warning : Colors.textSecondary}>
                    {item.locationStale ? 'Stale GPS' : item.locationAgeSeconds != null ? `${item.locationAgeSeconds}s ago` : 'Live'}
                  </MandiText>
                </View>
              </View>

              {/* Recommended Kitchen Action */}
              {item.recommendedAction && item.actionReason && (
                <View style={[styles.actionBanner, actionBannerStyle(item.recommendedAction)]}>
                  <View style={styles.actionTextWrap}>
                    <Ionicons
                      name={actionIcon(item.recommendedAction)}
                      size={15}
                      color={actionColor(item.recommendedAction)}
                    />
                    <MandiText variant="captionEmphasis" color={actionColor(item.recommendedAction)}>
                      {item.actionReason}
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

function SummaryBadge({ count, label, tone }: { count: number; label: string; tone: 'primary' | 'warning' | 'danger' | 'info' | 'neutral' }) {
  const color =
    tone === 'danger'
      ? Colors.danger
      : tone === 'warning'
        ? Colors.warning
        : tone === 'info'
          ? Colors.info
          : tone === 'primary'
            ? Colors.primary
            : Colors.textTertiary;

  return (
    <View style={styles.summaryBadge}>
      <MandiText variant="captionEmphasis" color={color}>
        {count}
      </MandiText>
      <MandiText variant="caption" color={Colors.textSecondary}>
        {label}
      </MandiText>
    </View>
  );
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
    case 'DRIVER_DISPATCHED': return 'Driver Dispatched';
    case 'AWAITING_DRIVER': return 'Awaiting Driver';
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
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surfaceSunken,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  summaryBadge: {
    alignItems: 'center',
    gap: 1,
  },
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
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  detailBlock: {
    flex: 1,
    gap: 2,
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
