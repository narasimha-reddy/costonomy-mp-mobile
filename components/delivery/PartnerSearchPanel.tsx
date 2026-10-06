import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MandiButton, MandiText } from '@/components/common';
import { SearchProgressBar } from '@/components/delivery/SearchProgressBar';
import { canRetryPartner, noPartnerNote, searchProgress } from '@/lib/delivery/deliveryPartner';
import type { TrackingDelivery } from '@/lib/delivery/orderTracking';
import { Colors, Elevation, Radius, Spacing } from '@/theme';

/**
 * Between packed and a partner: the search, and when it comes up empty, what the supplier can do.
 *
 * <p>The buyer gets a reassurance and never a failure reason or an action. The supplier sees how far through the
 * automatic search we are with a "Try again now", and when it has stopped without a partner, the two ways forward.
 * Neither action changes what is shown until the server says so.
 */
export function PartnerSearchPanel({
  audience, delivery, nowMs, onRetry, onSwitchOwn, retrying = false, switching = false,
}: {
  audience: 'buyer' | 'supplier';
  delivery: TrackingDelivery | null;
  nowMs: number;
  onRetry?: () => void;
  onSwitchOwn?: () => void;
  retrying?: boolean;
  switching?: boolean;
}) {
  const buyer = audience === 'buyer';
  const stopped = delivery != null && canRetryPartner(delivery.mode, delivery.status);

  if (buyer) {
    // When the partner fell through the hero and the banner say so; here only the reassurance.
    if (stopped && delivery.status !== 'DRIVER_CANCELLED' && delivery.status !== 'PICKUP_FAILED') return null;
    return (
      <View style={styles.card}>
        <MandiText variant="bodyEmphasis">Assigning a partner</MandiText>
        <MandiText variant="caption" color={Colors.textSecondary}>
          Your order is packed. You do not need to do anything.
        </MandiText>
      </View>
    );
  }
  if (delivery == null) return null;

  if (stopped) {
    return (
      <View style={styles.card}>
        <MandiText variant="bodyEmphasis">Search finished</MandiText>
        {/* The reason is in the hero above; repeating it here read as two errors. */}
        <MandiText variant="caption" color={Colors.textSecondary} style={styles.body}>
          {delivery.canSwitchToOwn
            ? 'No partner was found. The order stays ready. You can try again, or deliver it yourself and keep the delivery charge the restaurant paid.'
            : noPartnerNote(delivery.canSwitchToOwn, delivery.retryUntil, new Date(nowMs))}
        </MandiText>
        <View style={styles.actions}>
          {onRetry && (
            <MandiButton label="Try again" size="md" onPress={onRetry} loading={retrying} disabled={switching} />
          )}
          {delivery.canSwitchToOwn && onSwitchOwn && (
            <MandiButton
              label="I will deliver it myself"
              variant="secondary"
              size="md"
              onPress={onSwitchOwn}
              loading={switching}
              disabled={retrying}
            />
          )}
        </View>
      </View>
    );
  }

  const progress = searchProgress(delivery.searchStartedAt, delivery.retryUntil, new Date(nowMs));
  return (
    <View style={styles.card}>
      <MandiText variant="bodyEmphasis">Searching for a partner</MandiText>
      {progress.fraction != null && progress.minutesElapsed != null && progress.minutesTotal != null && (
        <SearchProgressBar
          fraction={progress.fraction}
          label={`${progress.minutesElapsed} of ${progress.minutesTotal} min`}
          note="Auto-retrying"
        />
      )}
      {onRetry && (
        <View style={styles.actions}>
          <MandiButton label="Try again now" variant="secondary" size="md" onPress={onRetry} loading={retrying} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg - 2,
    paddingVertical: Spacing.md,
    gap: 2,
    ...Elevation.card,
  },
  body: { marginBottom: Spacing.sm },
  actions: { gap: Spacing.sm, marginTop: Spacing.md },
});
