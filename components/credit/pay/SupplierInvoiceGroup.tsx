import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiCard, MandiText } from '@/components/common';
import { supplierAllLabel } from '@/lib/credit/pay/copy';
import { supplierState, type Selection } from '@/lib/credit/pay/selection';
import type { PayableSupplier } from '@/models/creditPay';
import { Colors, IconSize, Spacing, TouchTarget } from '@/theme';
import { PayInvoiceRow } from './PayInvoiceRow';

/** One supplier's open invoices, with a tri-state "select all". A supplier not payable here is read only. */
export function SupplierInvoiceGroup({
  supplier, selection, onToggleSupplier, onToggleInvoice,
}: {
  supplier: PayableSupplier;
  selection: Selection;
  onToggleSupplier: () => void;
  onToggleInvoice: (invoiceId: number) => void;
}) {
  const state = supplierState(selection, supplier);
  const icon = state === 'all' ? 'checkbox' : state === 'some' ? 'remove-circle-outline' : 'square-outline';
  return (
    <MandiCard testID={`pay-supplier-${supplier.agreementId}`}>
      <View style={styles.body}>
        <View style={styles.header}>
          <Pressable
            testID={`pay-supplier-all-${supplier.agreementId}`}
            onPress={onToggleSupplier}
            disabled={!supplier.payable}
            accessibilityRole="checkbox"
            accessibilityLabel={supplierAllLabel(supplier.supplierName)}
            accessibilityState={{ checked: state === 'all' ? true : state === 'some' ? 'mixed' : false, disabled: !supplier.payable }}
            style={styles.check}
          >
            <Ionicons
              name={icon}
              size={IconSize.lg}
              color={state === 'none' || !supplier.payable ? Colors.textTertiary : Colors.primary}
            />
          </Pressable>
          <MandiText variant="bodyEmphasis" style={styles.name} numberOfLines={1}>{supplier.supplierName}</MandiText>
        </View>
        {!supplier.payable && supplier.notPayableReason != null && (
          <MandiText variant="caption" color={Colors.textSecondary}>{supplier.notPayableReason}</MandiText>
        )}
        {supplier.invoices.map((invoice) => (
          <PayInvoiceRow
            key={invoice.invoiceId}
            invoice={invoice}
            selected={selection.ids.has(invoice.invoiceId)}
            disabled={!supplier.payable}
            onToggle={() => onToggleInvoice(invoice.invoiceId)}
          />
        ))}
      </View>
    </MandiCard>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  check: { minHeight: TouchTarget.min, minWidth: TouchTarget.min, justifyContent: 'center', alignItems: 'center' },
  name: { flex: 1 },
});
