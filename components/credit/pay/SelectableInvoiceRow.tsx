import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CreditInvoiceRow } from '@/components/credit/CreditInvoiceRow';
import type { CreditInvoiceListItem } from '@/lib/credit/invoices';
import { formatMoney } from '@/utils/money';
import { Colors, IconSize, TouchTarget, Spacing } from '@/theme';

/**
 * An open invoice on a supplier's credit page, with the pay picker's checkbox beside it. The checkbox only
 * ticks; tapping the card still opens the invoice.
 */
export function SelectableInvoiceRow({
  invoice, selected, onToggle, onPress,
}: { invoice: CreditInvoiceListItem; selected: boolean; onToggle: () => void; onPress: () => void }) {
  const label = [`Invoice ${invoice.invoiceNumber}`, formatMoney(invoice.outstanding), selected ? 'selected' : null]
    .filter(Boolean).join(', ');
  return (
    <View style={styles.row}>
      <Pressable
        testID={`credit-invoice-check-${invoice.id}`}
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityLabel={label}
        accessibilityState={{ checked: selected }}
        style={styles.check}
      >
        <Ionicons
          name={selected ? 'checkbox' : 'square-outline'}
          size={IconSize.lg}
          color={selected ? Colors.primary : Colors.textTertiary}
        />
      </Pressable>
      <View style={styles.card}>
        <CreditInvoiceRow invoice={invoice} onPress={onPress} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  check: { minHeight: TouchTarget.min, minWidth: TouchTarget.min, justifyContent: 'center', alignItems: 'center' },
  card: { flex: 1 },
});
