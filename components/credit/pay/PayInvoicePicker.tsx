import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { Selection } from '@/lib/credit/pay/selection';
import type { PayableInvoices } from '@/models/creditPay';
import { Spacing } from '@/theme';
import { SupplierInvoiceGroup } from './SupplierInvoiceGroup';

/** The supplier groups, in the order the server sent them. */
export function PayInvoicePicker({
  data, selection, onToggleSupplier, onToggleInvoice,
}: {
  data: PayableInvoices;
  selection: Selection;
  onToggleSupplier: (agreementId: number) => void;
  onToggleInvoice: (invoiceId: number) => void;
}) {
  return (
    <View style={styles.list} testID="credit-pay-picker">
      {data.suppliers.map((supplier) => (
        <SupplierInvoiceGroup
          key={supplier.agreementId}
          supplier={supplier}
          selection={selection}
          onToggleSupplier={() => onToggleSupplier(supplier.agreementId)}
          onToggleInvoice={onToggleInvoice}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ list: { gap: Spacing.listGap } });
