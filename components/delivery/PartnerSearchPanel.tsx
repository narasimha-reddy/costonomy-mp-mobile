import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MandiButton, MandiCard, MandiText } from '@/components/common';
import { SearchProgressBar } from '@/components/delivery/SearchProgressBar';
import { canRetryPartner, noPartnerNote, searchProgress } from '@/lib/delivery/deliveryPartner';
import type { Delivery } from '@/models/delivery';
import { Colors, Spacing } from '@/theme';

/**
 * Between Ready and Partner: the search for a delivery partner, and when it comes up empty, what the supplier can do.
 *
 * <p>The buyer sees an indeterminate bar and never a failure reason. The supplier sees how far through the automatic
 * search we are, and when it has stopped without a partner, the server's reason and the two ways forward. Neither
 * action changes what is shown until the server says so.
 */
export function PartnerSearchPanel({
  audience, delivery, nowMs, onRetry, onSwitchOwn, retrying = false, switching = false,
}: {
  audience: 'buyer' | 'supplier';
  delivery: Pick<Delivery, 'mode' | 'status' | 'failureReason' | 'canSwitchToOwn' | 'retryUntil' | 'searchStartedAt'> | null;
  nowMs: number;
  onRetry?: () => void;
  onSwitchOwn?: () => void;
  retrying?: boolean;
  switching?: boolean;
}) {
  const buyer = audience === 'buyer';
  const stopped = delivery != null && canRetryPartner(delivery.mode, delivery.status);

  if (stopped) {
    if (buyer) return null; // The hero already says it calmly; the reason is the supplier's.
    return (
      <MandiCard accentColor={Colors.warning}>
        <View style={styles.body}>
          <MandiText variant="bodyEmphasis">No partner found yet</MandiText>
          {/* The reason is in the hero above; repeating it here read as two errors. */}
          <MandiText variant="caption" color={Colors.textSecondary}>
            {noPartnerNote(delivery.canSwitchToOwn, delivery.retryUntil, new Date(nowMs))}
          </MandiText>
          {onRetry && (
            <MandiButton label="Try again" size="md" onPress={onRetry} loading={retrying} disabled={switching} />
          )}
          {delivery.canSwitchToOwn && onSwitchOwn && (
            <MandiButton
              label="I'll deliver it myself"
              variant="secondary"
              size="md"
              onPress={onSwitchOwn}
              loading={switching}
              disabled={retrying}
            />
          )}
        </View>
      </MandiCard>
    );
  }

  if (buyer) {
    return (
      <MandiCard outlined>
        <SearchProgressBar fraction={null} label="This usually takes a few minutes" />
      </MandiCard>
    );
  }
  if (delivery == null) return null;
  const progress = searchProgress(delivery.searchStartedAt, delivery.retryUntil, new Date(nowMs));
  const label = progress.minutesElapsed != null && progress.minutesTotal != null
    ? `Searching for a partner… ${progress.minutesElapsed} of ${progress.minutesTotal} min`
    : 'Searching for a partner…';
  return (
    <MandiCard outlined>
      <SearchProgressBar fraction={progress.fraction} label={label} />
    </MandiCard>
  );
}

const styles = StyleSheet.create({ body: { gap: Spacing.sm } });
