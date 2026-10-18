import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiStatusChip, MandiText } from '@/components/common';
import { dueChip } from '@/lib/credit/dueChip';
import type { PayableInvoice } from '@/models/creditPay';
import { formatMoney } from '@/utils/money';
import { Colors, IconSize, Spacing, TouchTarget } from '@/theme';

/** One open invoice in the pay picker: a checkbox row. The amount is the server's outstanding. */
export function PayInvoiceRow({
  invoice, selected, disabled, onToggle,
}: { invoice: PayableInvoice; selected: boolean; disabled: boolean; onToggle: () => void }) {
  const chip = dueChip(invoice.dueState, invoice.daysToDue);
  const label = [
    `Invoice ${invoice.invoiceNumber}`, formatMoney(invoice.outstanding), chip?.label, selected ? 'selected' : null,
  ].filter(Boolean).join(', ');
  return (
    <Pressable
      testID={`pay-invoice-${invoice.invoiceId}`}
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      style={[styles.row, disabled && styles.disabled]}
    >
      <Ionicons
        name={selected ? 'checkbox' : 'square-outline'}
        size={IconSize.lg}
        color={selected ? Colors.primary : Colors.textTertiary}
      />
      <View style={styles.main}>
        <MandiText variant="bodyEmphasis" numberOfLines={1}>{invoice.invoiceNumber}</MandiText>
        {chip != null && <MandiStatusChip label={chip.label} tone={chip.tone} size="sm" />}
      </View>
      <MandiText variant="bodyEmphasis">{formatMoney(invoice.outstanding)}</MandiText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: TouchTarget.min, paddingVertical: Spacing.xs },
  main: { flex: 1, alignItems: 'flex-start', gap: Spacing.xs },
  disabled: { opacity: 0.5 },
});
