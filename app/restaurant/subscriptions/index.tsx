import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import {
  addSubscriptionSkipDate,
  cancelSubscription,
  fetchOutletSubscriptions,
  pauseSubscription,
  resumeSubscription,
} from '@/services/subscription';
import {
  MandiButton,
  MandiCard,
  MandiConfirm,
  MandiEmptyState,
  MandiErrorState,
  MandiHeader,
  MandiScreen,
  MandiSkeletonList,
  MandiStatusChip,
  MandiText,
  useToast,
} from '@/components/common';
import type { Subscription } from '@/models/subscription';
import { ApiError } from '@/lib/api/errors';
import { Colors, Radius, Spacing } from '@/theme';
import { deliveryModeLabel, paymentMethodLabel } from '@/lib/subscription/form';

export default function SubscriptionsScreen() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();
  const { outletId } = useOutlet();

  const [confirmCancelId, setConfirmCancelId] = useState<number | null>(null);

  const { data: list = [], isLoading, error, refetch } = useQuery({
    queryKey: ['outlet-subscriptions', outletId],
    queryFn: () => fetchOutletSubscriptions(accessToken as string, outletId as number),
    enabled: accessToken != null && Boolean(outletId),
  });

  const pauseMutation = useMutation({
    mutationFn: (id: number) => pauseSubscription(accessToken as string, id),
    onSuccess: () => {
      toast.show('Subscription paused', 'success');
      queryClient.invalidateQueries({ queryKey: ['outlet-subscriptions', outletId] });
    },
    onError: (err) => toast.show(err instanceof ApiError ? err.message : 'Could not pause', 'error'),
  });

  const resumeMutation = useMutation({
    mutationFn: (id: number) => resumeSubscription(accessToken as string, id),
    onSuccess: () => {
      toast.show('Subscription resumed', 'success');
      queryClient.invalidateQueries({ queryKey: ['outlet-subscriptions', outletId] });
    },
    onError: (err) => toast.show(err instanceof ApiError ? err.message : 'Could not resume', 'error'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => cancelSubscription(accessToken as string, id),
    onSuccess: () => {
      toast.show('Subscription cancelled', 'success');
      setConfirmCancelId(null);
      queryClient.invalidateQueries({ queryKey: ['outlet-subscriptions', outletId] });
    },
    onError: (err) => toast.show(err instanceof ApiError ? err.message : 'Could not cancel', 'error'),
  });

  const skipMutation = useMutation({
    mutationFn: ({ id, date }: { id: number; date: string }) =>
      addSubscriptionSkipDate(accessToken as string, id, date, 'Skipped by restaurant'),
    onSuccess: () => {
      toast.show('Next delivery skipped', 'success');
      queryClient.invalidateQueries({ queryKey: ['outlet-subscriptions', outletId] });
    },
    onError: (err) => toast.show(err instanceof ApiError ? err.message : 'Could not skip date', 'error'),
  });

  const renderItem = ({ item }: { item: Subscription }) => {
    const isPaused = item.status === 'PAUSED';
    const isCancelled = item.status === 'CANCELLED';

    return (
      <MandiCard>
        <View style={styles.headerRow}>
          <View style={styles.flex}>
            <MandiText variant="bodyEmphasis">{item.productName ?? item.skuDescription}</MandiText>
            <MandiText variant="caption" color={Colors.textSecondary}>
              {item.storeName}
            </MandiText>
          </View>
          <MandiStatusChip
            label={item.status}
            tone={item.status === 'ACTIVE' ? 'success' : item.status === 'PAUSED' ? 'warning' : 'neutral'}
            size="sm"
          />
        </View>

        <View style={styles.detailRow}>
          <MandiText variant="captionEmphasis">
            {item.quantity} {item.unit}
          </MandiText>
          <MandiText variant="caption" color={Colors.textSecondary}>
            Frequency: {item.frequency.replace(/_/g, ' ')}
          </MandiText>
          {item.preferredSlotName ? (
            <MandiText variant="caption" color={Colors.primary}>
              Slot: {item.preferredSlotName}
            </MandiText>
          ) : null}
        </View>

        {/* How each delivery is paid for and how it gets here, as the API sends them (API D-132). */}
        <View style={styles.detailRow}>
          {paymentMethodLabel(item.paymentMethod) != null && (
            <MandiText variant="caption" color={Colors.textSecondary}>
              {paymentMethodLabel(item.paymentMethod)}
            </MandiText>
          )}
          {deliveryModeLabel(item.deliveryMode) != null && (
            <MandiText variant="caption" color={Colors.textSecondary}>
              {deliveryModeLabel(item.deliveryMode)}
            </MandiText>
          )}
        </View>

        {item.nextDeliveryDate && !isCancelled && !isPaused && (
          <View style={styles.nextDateBox}>
            <MandiText variant="captionEmphasis" color={Colors.primary}>
              Next Delivery: {item.nextDeliveryDate}
            </MandiText>
          </View>
        )}

        {item.skipDates.length > 0 && (
          <MandiText variant="caption" color={Colors.warning}>
            Skipped Dates: {item.skipDates.join(', ')}
          </MandiText>
        )}

        {!isCancelled && (
          <View style={styles.actionsRow}>
            {isPaused ? (
              <MandiButton
                label="Resume"
                size="sm"
                loading={resumeMutation.isPending}
                onPress={() => resumeMutation.mutate(item.id)}
              />
            ) : (
              <>
                <MandiButton
                  label="Pause"
                  size="sm"
                  variant="secondary"
                  loading={pauseMutation.isPending}
                  onPress={() => pauseMutation.mutate(item.id)}
                />
                {item.nextDeliveryDate && (
                  <MandiButton
                    label="Skip Next"
                    size="sm"
                    variant="secondary"
                    loading={skipMutation.isPending}
                    onPress={() => skipMutation.mutate({ id: item.id, date: item.nextDeliveryDate as string })}
                  />
                )}
              </>
            )}
            <MandiButton
              label="Cancel"
              size="sm"
              variant="destructive"
              onPress={() => setConfirmCancelId(item.id)}
            />
          </View>
        )}
      </MandiCard>
    );
  };

  return (
    <MandiScreen
      header={<MandiHeader title="Daily Subscriptions" back />}
      onRefresh={refetch}
      refreshing={isLoading}
    >
      <MandiConfirm
        visible={confirmCancelId != null}
        title="Cancel Subscription?"
        message="Future daily deliveries will stop immediately."
        confirmLabel="Cancel Subscription"
        cancelLabel="Keep"
        destructive
        onConfirm={() => {
          if (confirmCancelId) cancelMutation.mutate(confirmCancelId);
        }}
        onCancel={() => setConfirmCancelId(null)}
      />

      {isLoading ? (
        <MandiSkeletonList count={3} />
      ) : error ? (
        <MandiErrorState message="Could not load subscriptions" onRetry={refetch} />
      ) : list.length === 0 ? (
        <MandiEmptyState
          title="No Active Subscriptions"
          description="Subscribe to daily items like milk, vegetables, and bread for scheduled morning replenishment."
          actionLabel="Explore Suppliers"
          onAction={() => router.push('/restaurant/suppliers')}
        />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}
    </MandiScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { gap: Spacing.sm, paddingBottom: Spacing.xl },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  detailRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.xs, flexWrap: 'wrap' },
  nextDateBox: {
    marginTop: Spacing.xs,
    padding: Spacing.xs,
    backgroundColor: Colors.surfaceSunken,
    borderRadius: Radius.sm,
  },
  actionsRow: { flexDirection: 'row', gap: Spacing.xs, marginTop: Spacing.sm },
});
