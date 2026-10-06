import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MandiText } from '@/components/common';
import { feeLine, methodAndReference, paymentSourceLabel, payoutStatusLabel } from '@/lib/credit/payouts';
import type { CreditPayout, StorePayment } from '@/models/credit';
import { formatDay } from '@/utils/dateRange';
import { formatMoney } from '@/utils/money';
import { Colors, Radius, Spacing } from '@/theme';

const ROW_MIN = 48;

/**
 * One wallet repayment Mandi collected. Gross, fee and net are the server's three figures
 * and the net, what the supplier gets, is the bold one. Long names and large amounts wrap.
 */
export function PayoutRow({ payout, onPress }: { payout: CreditPayout; onPress: () => void }) {
  const name = payout.restaurantName ?? payout.outletName ?? 'A restaurant';
  const outlet = payout.outletName != null && payout.outletName !== name ? payout.outletName : null;
  const gross = `Paid ${formatMoney(payout.grossAmount)}`;
  const fee = feeLine(payout);
  const created = formatDay(payout.createdAt);
  const settled = payout.status === 'APPLIED' && payout.settlementNumber != null
    ? [`Settlement ${payout.settlementNumber}`, formatDay(payout.settlementDate)].filter(Boolean).join(' · ')
    : null;

  return (
    <Pressable
      testID={`payout-row-${payout.payoutId}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}. ${payoutStatusLabel(payout.status)}. ${gross}, ${fee}, you get ${formatMoney(payout.netAmount)}`}
      accessibilityHint="Opens the details"
      style={styles.row}
    >
      <View style={styles.main}>
        <MandiText variant="bodyEmphasis">{name}</MandiText>
        {outlet != null && <MandiText variant="caption" color={Colors.textSecondary}>{outlet}</MandiText>}
        <MandiText variant="caption" color={Colors.textSecondary}>{gross}</MandiText>
        <MandiText variant="caption" color={Colors.textSecondary}>{fee}</MandiText>
        {created != null && <MandiText variant="caption" color={Colors.textSecondary}>{created}</MandiText>}
        {settled != null && <MandiText variant="caption" color={Colors.success}>{settled}</MandiText>}
      </View>
      <View style={styles.amount}>
        <MandiText variant="caption" color={Colors.textSecondary}>You get</MandiText>
        <MandiText variant="price" testID={`payout-net-${payout.payoutId}`} style={styles.net}>
          {formatMoney(payout.netAmount)}
        </MandiText>
      </View>
    </Pressable>
  );
}

/** One payment on a credit line: who, which invoice, how much, how it was paid, when. */
export function PaymentRow({ payment }: { payment: StorePayment }) {
  const name = payment.restaurantName ?? payment.outletName ?? 'A restaurant';
  const how = methodAndReference(payment.method, payment.reference);
  const when = [paymentSourceLabel(payment.source), formatDay(payment.paidOn) ?? payment.paidOn].join(' · ');
  return (
    <View
      testID={`payment-row-${payment.id}`}
      accessible
      accessibilityLabel={`${name}. ${payment.invoiceNumber}. ${formatMoney(payment.amount)}${how != null ? `. ${how}` : ''}. ${when}`}
      style={styles.row}
    >
      <View style={styles.main}>
        <MandiText variant="bodyEmphasis">{name}</MandiText>
        <MandiText variant="caption" color={Colors.textSecondary}>{payment.invoiceNumber}</MandiText>
        {how != null && <MandiText variant="caption" color={Colors.textSecondary}>{how}</MandiText>}
        <MandiText variant="caption" color={Colors.textSecondary}>{when}</MandiText>
      </View>
      <MandiText variant="price" style={styles.net}>{formatMoney(payment.amount)}</MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: ROW_MIN,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
  },
  main: { flex: 1, flexShrink: 1, gap: 2 },
  amount: { flexShrink: 1, maxWidth: '50%', alignItems: 'flex-end', gap: 2 },
  net: { flexShrink: 1, textAlign: 'right' },
});
