import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiText } from '@/components/common';
import { paymentDetail, paymentTitle } from '@/lib/credit/payments';
import type { CreditInvoicePayment } from '@/models/credit';
import { formatDay } from '@/utils/dateRange';
import { formatMoney } from '@/utils/money';
import { Colors, IconSize, Spacing, TouchTarget } from '@/theme';

/** One payment against a credit invoice. A wallet payment opens its wallet transaction. */
export function CreditPaymentRow({
  payment,
  supplierName,
  onOpenWallet,
}: {
  payment: CreditInvoicePayment;
  supplierName: string | null;
  onOpenWallet?: (walletEntryId: number) => void;
}) {
  const title = paymentTitle(payment.source, supplierName);
  const detail = paymentDetail(payment.method, payment.reference, payment.source);
  const day = formatDay(payment.paidAt) ?? '';
  const amount = formatMoney(payment.amount);
  const open = payment.source === 'WALLET' && payment.walletEntryId != null && onOpenWallet != null
    ? () => onOpenWallet(payment.walletEntryId as number)
    : null;

  const body = (
    <>
      <View style={styles.text}>
        <MandiText variant="bodyEmphasis">{title}</MandiText>
        {detail != null && <MandiText variant="caption" color={Colors.textSecondary}>{detail}</MandiText>}
        <MandiText variant="caption" color={Colors.textTertiary}>{day}</MandiText>
      </View>
      <MandiText variant="bodyEmphasis">{amount}</MandiText>
      {open != null && <Ionicons name="chevron-forward" size={IconSize.sm} color={Colors.textTertiary} />}
    </>
  );

  const label = [title, detail, day, amount].filter(Boolean).join(', ');
  if (open == null) {
    return (
      <View style={styles.row} accessible accessibilityLabel={label} testID={`payment-${payment.id}`}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      style={styles.row}
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={`${label}. Opens the wallet transaction`}
      testID={`payment-${payment.id}`}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: TouchTarget.min,
    paddingVertical: Spacing.sm,
  },
  text: { flex: 1, gap: 2 },
});
