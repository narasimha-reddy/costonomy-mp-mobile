import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MandiCard, MandiStatusChip, MandiText } from '@/components/common';
import { dueChip } from '@/lib/credit/dueChip';
import { isSettled, type CreditInvoiceListItem } from '@/lib/credit/invoices';
import { formatMoney } from '@/utils/money';
import { Colors, Spacing } from '@/theme';

/** One invoice on the supplier credit screen. Tapping opens its detail. */
export function CreditInvoiceRow({
  invoice,
  onPress,
  selected,
  testID,
}: {
  invoice: CreditInvoiceListItem;
  onPress?: () => void;
  /** Set (true or false) when the row is one choice in a list; adds the word "Selected". */
  selected?: boolean;
  /** Overrides the default `credit-invoice-{id}`, for the same invoice drawn twice on a screen. */
  testID?: string;
}) {
  const chip = dueChip(invoice.dueState, invoice.daysToDue);
  const order = invoice.orderNumber ?? invoice.supplierOrderId;
  const orderText = order != null ? `Order #${order}` : null;
  const amountText = isSettled(invoice)
    ? `${formatMoney(invoice.amount)} invoice`
    : `${formatMoney(invoice.outstanding)} of ${formatMoney(invoice.amount)} owed`;

  const label = [
    `Invoice ${invoice.invoiceNumber}`,
    orderText,
    amountText,
    chip?.label,
    selected === true ? 'selected' : null,
  ].filter(Boolean).join(', ');

  return (
    <MandiCard
      compact
      outlined
      onPress={onPress}
      accentColor={selected === true ? Colors.primary : undefined}
      testID={testID ?? `credit-invoice-${invoice.id}`}
      accessibilityLabel={label}
    >
      <View style={styles.row}>
        <MandiText variant="bodyEmphasis" style={styles.flex}>{invoice.invoiceNumber}</MandiText>
        {chip != null && (
          <MandiStatusChip label={chip.label} tone={chip.tone} size="sm" testID={`credit-invoice-chip-${invoice.id}`} />
        )}
      </View>
      {orderText != null && (
        <MandiText variant="caption" color={Colors.textSecondary}>{orderText}</MandiText>
      )}
      <MandiText variant="caption" color={Colors.textSecondary}>{amountText}</MandiText>
      {selected === true && (
        <MandiText variant="captionEmphasis" color={Colors.primary}>Selected</MandiText>
      )}
    </MandiCard>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
});
