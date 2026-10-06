import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MandiStatusChip, MandiText } from '@/components/common';
import { paymentDetail } from '@/lib/credit/payments';
import { paymentBadge } from '@/lib/credit/supplierLine';
import type { StorePayment } from '@/models/credit';
import { formatDay } from '@/utils/dateRange';
import { formatMoney } from '@/utils/money';
import { Colors, Spacing, TouchTarget } from '@/theme';

/**
 * One payment on a restaurant's line: invoice, amount, who made it (the source badge),
 * how, and the day. `trailing` is the slot for a later Undo button; nothing is rendered
 * there yet.
 */
export function SupplierPaymentRow({
  payment, trailing, last = false,
}: {
  payment: StorePayment;
  trailing?: React.ReactNode;
  last?: boolean;
}) {
  const badge = paymentBadge(payment.source);
  const detail = paymentDetail(payment.method, payment.reference, payment.source);
  const day = formatDay(payment.paidOn) ?? payment.paidOn;
  const amount = formatMoney(payment.amount);
  const label = [payment.invoiceNumber, amount, badge, detail, day].filter(Boolean).join(', ');
  return (
    <View
      style={[styles.row, !last && styles.rule]}
      accessible
      accessibilityLabel={label}
      testID={`agreement-payment-${payment.id}`}
    >
      <View style={styles.left}>
        <MandiText variant="bodyEmphasis" numberOfLines={1}>{payment.invoiceNumber}</MandiText>
        {badge != null && (
          <View style={styles.chip}>
            <MandiStatusChip label={badge} tone="neutral" size="sm" testID={`payment-source-${payment.id}`} />
          </View>
        )}
        {detail != null && <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={2}>{detail}</MandiText>}
        <MandiText variant="caption" color={Colors.textTertiary}>{day}</MandiText>
      </View>
      <View style={styles.right}>
        <MandiText variant="bodyEmphasis">{amount}</MandiText>
        {trailing}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.md,
    minHeight: TouchTarget.min,
    paddingVertical: Spacing.sm,
  },
  rule: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  left: { flex: 1, gap: 2 },
  chip: { alignSelf: 'flex-start' },
  right: { alignItems: 'flex-end', gap: Spacing.xs },
});
