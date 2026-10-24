import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import {
  fetchStoreSubscriptionManifest,
} from '@/services/subscription';
import type { ManifestDeliveryOrder } from '@/models/subscription';
import {
  MandiCard,
  MandiEmptyState,
  MandiErrorState,
  MandiHeader,
  MandiScreen,
  MandiSkeletonList,
  MandiStatusChip,
  MandiText,
} from '@/components/common';
import { Colors, Radius, Spacing, TouchTarget } from '@/theme';

function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(d: Date): string {
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function SupplierManifestScreen() {
  const { storeId: paramStoreId } = useLocalSearchParams<{ storeId?: string }>();
  const { supplier } = useStore();
  const storeId = paramStoreId ? Number(paramStoreId) : supplier?.stores?.[0]?.id;

  const { accessToken } = useSession();

  const [currentDate, setCurrentDate] = useState(() => new Date());
  const dateStr = formatDate(currentDate);

  const manifestQuery = useQuery({
    queryKey: ['supplier-manifest', storeId, dateStr],
    queryFn: () => fetchStoreSubscriptionManifest(accessToken as string, storeId as number, dateStr),
    enabled: accessToken != null && storeId != null && Number.isFinite(storeId),
  });

  function shiftDate(offset: number) {
    const next = new Date(currentDate);
    next.setDate(next.getDate() + offset);
    setCurrentDate(next);
  }

  function setToday() {
    setCurrentDate(new Date());
  }

  if (storeId == null) {
    return (
      <MandiScreen header={<MandiHeader title="Daily manifest" back />}>
        <MandiEmptyState
          title="No store selected"
          description="Please choose a store to view subscription manifests."
        />
      </MandiScreen>
    );
  }

  const manifest = manifestQuery.data;
  const aggregatedItems = manifest?.aggregatedItems ?? [];
  const deliveries = manifest?.deliveries ?? [];

  // Group deliveries by slot
  const slotGroups: Record<string, ManifestDeliveryOrder[]> = {};
  deliveries.forEach((d) => {
    const key = d.slotName || 'Standard / any time';
    if (!slotGroups[key]) slotGroups[key] = [];
    slotGroups[key].push(d);
  });

  return (
    <MandiScreen
      header={<MandiHeader title="Daily manifest" subtitle="Subscription dispatches" back />}
    >
      {/* Orders are created by the platform each evening for the next day (API D-132); there is nothing to trigger. */}
      <MandiText variant="caption" color={Colors.textSecondary}>
        Subscription orders are created automatically each evening for the next day.
      </MandiText>

      {/* Date Navigation Bar */}
      <View style={styles.dateNav}>
        <Pressable
          style={styles.navArrow}
          onPress={() => shiftDate(-1)}
          accessibilityRole="button"
          accessibilityLabel="Previous day"
        >
          <Ionicons name="chevron-back" size={20} color={Colors.textPrimary} />
        </Pressable>

        <Pressable style={styles.dateDisplay} onPress={setToday}>
          <MandiText variant="subtitle">{formatDisplayDate(currentDate)}</MandiText>
          {dateStr === formatDate(new Date()) && (
            <MandiStatusChip tone="info" label="Today" />
          )}
        </Pressable>

        <Pressable
          style={styles.navArrow}
          onPress={() => shiftDate(1)}
          accessibilityRole="button"
          accessibilityLabel="Next day"
        >
          <Ionicons name="chevron-forward" size={20} color={Colors.textPrimary} />
        </Pressable>
      </View>

      {manifestQuery.isLoading ? (
        <MandiSkeletonList count={3} />
      ) : manifestQuery.error ? (
        <MandiErrorState
          message="Could not load subscription manifest."
          onRetry={() => manifestQuery.refetch()}
        />
      ) : deliveries.length === 0 ? (
        <MandiEmptyState
          icon="calendar-outline"
          title="No scheduled deliveries"
          description={`There are no active subscriptions scheduled for ${formatDisplayDate(currentDate)}.`}
        />
      ) : (
        <View style={styles.content}>
          {/* Section 1: Aggregated SKU Packing List */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="cube-outline" size={18} color={Colors.primary} />
              <MandiText variant="label">Consolidated Packing List ({aggregatedItems.length} SKUs)</MandiText>
            </View>
            <MandiCard style={styles.packingCard}>
              {aggregatedItems.map((item, idx) => (
                <View
                  key={item.supplierSkuId}
                  style={[
                    styles.packingRow,
                    idx > 0 && styles.packingDivider,
                  ]}
                >
                  <View style={styles.flex}>
                    <MandiText variant="bodyEmphasis">{item.productName}</MandiText>
                    <MandiText variant="caption" color={Colors.textSecondary}>
                      SKU #{item.supplierSkuId}
                    </MandiText>
                  </View>
                  <View style={styles.volumeBadge}>
                    <MandiText variant="bodyEmphasis" color={Colors.primary}>
                      {item.totalQuantity} {item.unit}
                    </MandiText>
                  </View>
                </View>
              ))}
            </MandiCard>
          </View>

          {/* Section 2: Deliveries Grouped by Slot */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="time-outline" size={18} color={Colors.primary} />
              <MandiText variant="label">Deliveries by Slot ({deliveries.length} outlets)</MandiText>
            </View>

            {Object.entries(slotGroups).map(([slotName, groupDeliveries]) => (
              <View key={slotName} style={styles.slotBlock}>
                <View style={styles.slotBlockHeader}>
                  <MandiText variant="captionEmphasis" color={Colors.textPrimary}>
                    {slotName}
                  </MandiText>
                  <MandiStatusChip tone="neutral" label={`${groupDeliveries.length} orders`} />
                </View>

                {groupDeliveries.map((delivery) => (
                  <MandiCard key={`${delivery.subscriptionId}-${delivery.supplierSkuId}`} style={styles.deliveryCard}>
                    <View style={styles.deliveryHeader}>
                      <View style={styles.flex}>
                        <MandiText variant="bodyEmphasis">
                          {delivery.restaurantName || delivery.outletName}
                        </MandiText>
                        <MandiText variant="caption" color={Colors.textSecondary}>
                          {delivery.outletAddress || 'No address provided'}
                        </MandiText>
                        {delivery.contactPhone ? (
                          <MandiText variant="caption" color={Colors.primary} style={{ marginTop: 2 }}>
                            {delivery.contactPhone}
                          </MandiText>
                        ) : null}
                      </View>
                      <MandiStatusChip
                        tone={
                          delivery.deliveryMode === 'PICKUP'
                            ? 'neutral'
                            : delivery.deliveryMode === 'COSTONOMY'
                              ? 'info'
                              : 'success'
                        }
                        label={
                          delivery.deliveryMode === 'PICKUP'
                            ? 'Store pickup'
                            : delivery.deliveryMode === 'COSTONOMY'
                              ? 'Costonomy delivery'
                              : 'Supplier delivery'
                        }
                      />
                    </View>

                    <View style={styles.deliveryItemRow}>
                      <Ionicons name="chevron-forward" size={14} color={Colors.textTertiary} />
                      <MandiText variant="body" style={styles.flex}>
                        {delivery.productName}
                      </MandiText>
                      <MandiText variant="bodyEmphasis" color={Colors.primary}>
                        {delivery.quantity} {delivery.unit}
                      </MandiText>
                    </View>
                  </MandiCard>
                ))}
              </View>
            ))}
          </View>
        </View>
      )}
    </MandiScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surfaceSunken,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    marginBottom: Spacing.md,
  },
  navArrow: {
    width: TouchTarget.min,
    height: TouchTarget.min - 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
  },
  dateDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  content: {
    gap: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  section: {
    gap: Spacing.xs,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: 2,
  },
  packingCard: {
    padding: Spacing.md,
  },
  packingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
  },
  packingDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderLight,
    paddingTop: Spacing.sm,
    marginTop: Spacing.xs,
  },
  volumeBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Radius.sm,
  },
  slotBlock: {
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  slotBlockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: Spacing.xs,
  },
  deliveryCard: {
    gap: Spacing.sm,
  },
  deliveryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  deliveryItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surfaceSunken,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.sm,
  },
});
