import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MandiStatusChip, MandiText } from '@/components/common';
import { paymentDetail } from '@/lib/credit/payments';
import { cancelledOnText, mayUndo, undoUntilText } from '@/lib/credit/reversal';
import { paymentBadge } from '@/lib/credit/supplierLine';
import type { StorePayment } from '@/models/credit';
import { formatDay } from '@/utils/dateRange';
import { formatMoney } from '@/utils/money';
import { Colors, Spacing, TouchTarget } from '@/theme';

/**
 * One payment on a restaurant's line: invoice, amount, who made it (the source badge),
 * how, and the day. The trailing slot holds "Undo" with its last day, only when the server
 * says the payment is `reversible` AND the caller passes `onUndo` (the caller passes it only
 * to people who may collect). A reversed payment stays, marked Cancelled, its amount struck
 * and muted, and is not undoable.
 */
export function SupplierPaymentRow({
  payment, trailing, last = false, onUndo, undoDisabled = false,
}: {
  payment: StorePayment;
  trailing?: React.ReactNode;
  last?: boolean;
  onUndo?: (payment: StorePayment) => void;
  undoDisabled?: boolean;
}) {
  const cancelled = payment.reversedAt != null;
  const cancelledOn = cancelledOnText(payment.reversedAt);
  const canUndo = mayUndo(payment, onUndo != null);
  const until = undoUntilText(payment.reversibleUntil);
  const badge = paymentBadge(payment.source);
  const detail = paymentDetail(payment.method, payment.reference, payment.source);
  const day = formatDay(payment.paidOn) ?? payment.paidOn;
  const amount = formatMoney(payment.amount);
  const label = [
    payment.invoiceNumber, amount, cancelled ? (cancelledOn ?? 'Cancelled') : null, badge, detail, day,
    canUndo ? until : null,
  ].filter(Boolean).join(', ');
  return (
    <View
      style={[styles.row, !last && styles.rule]}
      accessible={!canUndo}
      accessibilityLabel={label}
      testID={`agreement-payment-${payment.id}`}
    >
      <View style={styles.left}>
        <MandiText variant="bodyEmphasis" numberOfLines={1}>{payment.invoiceNumber}</MandiText>
        {cancelled && (
          <View style={styles.chip}>
            <MandiStatusChip label="Cancelled" tone="danger" size="sm" testID={`payment-cancelled-${payment.id}`} />
          </View>
        )}
        {badge != null && (
          <View style={styles.chip}>
            <MandiStatusChip label={badge} tone="neutral" size="sm" testID={`payment-source-${payment.id}`} />
          </View>
        )}
        {detail != null && <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={2}>{detail}</MandiText>}
        <MandiText variant="caption" color={Colors.textTertiary}>{day}</MandiText>
        {cancelled && cancelledOn != null && (
          <MandiText variant="caption" color={Colors.textTertiary} testID={`payment-cancelled-on-${payment.id}`}>
            {cancelledOn}
          </MandiText>
        )}
      </View>
      <View style={styles.right}>
        <MandiText
          variant="bodyEmphasis"
          color={cancelled ? Colors.textTertiary : undefined}
          style={cancelled ? styles.struck : undefined}
          testID={`payment-amount-${payment.id}`}
        >
          {amount}
        </MandiText>
        {canUndo && (
          <Pressable
            testID={`undo-payment-${payment.id}`}
            onPress={() => onUndo?.(payment)}
            disabled={undoDisabled}
            accessibilityRole="button"
            accessibilityLabel={`Undo ${amount} payment on ${payment.invoiceNumber}`}
            accessibilityHint={until ?? undefined}
            accessibilityState={{ disabled: undoDisabled }}
            style={({ pressed }) => [styles.undo, pressed && styles.pressed, undoDisabled && styles.dim]}
          >
            <MandiText variant="bodyEmphasis" color={Colors.primary}>Undo</MandiText>
            {until != null && <MandiText variant="caption" color={Colors.textTertiary}>{until}</MandiText>}
          </Pressable>
        )}
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
  right: { alignItems: 'flex-end', gap: Spacing.xs, maxWidth: '45%' },
  struck: { textDecorationLine: 'line-through' },
  undo: {
    minHeight: TouchTarget.min,
    minWidth: TouchTarget.min,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  dim: { opacity: 0.5 },
});
