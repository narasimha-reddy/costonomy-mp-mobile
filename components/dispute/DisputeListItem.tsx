import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MandiCard, MandiStatusChip, MandiText } from '@/components/common';
import type { Dispute } from '@/models/trust';
import { DisputeStatus, resolveStatus } from '@/models/status';
import { refundCopy, type RefundViewer } from '@/lib/disputes/refundCopy';
import { categoryLabel } from '@/lib/disputes/categories';
import { serverNow } from '@/lib/server-clock';
import { formatMomentWithRecency } from '@/utils/dateRange';
import { Colors, Spacing } from '@/theme';

/**
 * One dispute in a Disputes list (API D-104). The dispute's own status, and — when
 * money was asked for — where the refund has got to, which is usually the thing
 * the reader opened the list to find out.
 */
export function DisputeListItem({
  dispute,
  viewer,
  onPress,
}: {
  dispute: Dispute;
  viewer: RefundViewer;
  onPress: () => void;
}) {
  const refund = dispute.refundRequest == null ? null : refundCopy(dispute.refundRequest, viewer, serverNow());
  return (
    <MandiCard onPress={onPress}>
      <View style={styles.row}>
        <MandiText variant="bodyEmphasis">{dispute.disputeNumber}</MandiText>
        <MandiStatusChip {...resolveStatus(DisputeStatus, dispute.status)} size="sm" />
      </View>
      <MandiText variant="caption" color={Colors.textSecondary}>
        Order {dispute.orderNumber} · {categoryLabel(dispute.category)} ·{' '}
        {formatMomentWithRecency(dispute.createdAt)}
      </MandiText>
      {refund != null && (
        <View style={styles.row}>
          <MandiText variant="caption" color={Colors.textSecondary}>Refund</MandiText>
          <MandiStatusChip label={refund.label} tone={refund.tone} size="sm" />
        </View>
      )}
    </MandiCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
});
