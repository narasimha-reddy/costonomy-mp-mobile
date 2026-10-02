import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MandiCard, MandiStatusChip, MandiText } from '@/components/common';
import type { DisputeRefund } from '@/models/trust';
import { refundCopy, type RefundViewer } from '@/lib/disputes/refundCopy';
import { serverNow } from '@/lib/server-clock';
import { formatMoney } from '@/utils/money';
import { formatDeadline } from '@/utils/dateRange';
import { Colors, Spacing } from '@/theme';

/** Where a refund asked for on a dispute has got to, in the viewer's terms. API D-104. */
export function RefundStatusCard({
  refund,
  viewer,
  children,
}: {
  refund: DisputeRefund;
  viewer: RefundViewer;
  /** Actions, when the viewer has something to do. */
  children?: React.ReactNode;
}) {
  const copy = refundCopy(refund, viewer, serverNow());
  return (
    <MandiCard>
      <View style={styles.row}>
        <MandiText variant="bodyEmphasis">Refund of {formatMoney(refund.amount)}</MandiText>
        <MandiStatusChip label={copy.label} tone={copy.tone} size="sm" />
      </View>
      <MandiText variant="body">{copy.detail}</MandiText>
      {refund.reason != null && refund.reason.trim() !== '' && (
        <MandiText variant="caption" color={Colors.textSecondary}>
          Reason given: {refund.reason}
        </MandiText>
      )}
      {refund.status === 'REQUESTED' && refund.supplierAnswerBy != null && (
        <MandiText variant="caption" color={Colors.textSecondary}>
          {`Supplier's answer due by ${formatDeadline(refund.supplierAnswerBy)}`}
        </MandiText>
      )}
      {children}
    </MandiCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
});
