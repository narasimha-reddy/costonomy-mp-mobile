import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MandiCard, MandiText } from '@/components/common';
import { creditedRowValue, hasCredit } from '@/lib/credit/creditNotes';
import type { Money } from '@/utils/money';
import { formatMoney } from '@/utils/money';
import { Colors, Spacing } from '@/theme';

function Line({ label, value, testID, strong }: { label: string; value: string; testID?: string; strong?: boolean }) {
  return (
    <View style={styles.line} accessible accessibilityLabel={`${label} ${value}`} testID={testID}>
      <MandiText variant="body" color={Colors.textSecondary} style={styles.label}>{label}</MandiText>
      <MandiText variant={strong ? 'bodyEmphasis' : 'body'} style={styles.value}>{value}</MandiText>
    </View>
  );
}

/**
 * An invoice's money lines, the same on both apps: Invoice amount, Paid, Credit note (only when
 * something was credited), Still owed. Every figure is the server's; the Credit note row is its
 * `creditedAmount`, shown as a deduction.
 */
export function InvoiceMoneyCard({ invoice }: {
  invoice: { amount: Money; paidAmount: Money; creditedAmount?: Money; outstanding: Money };
}) {
  return (
    <MandiCard>
      <Line label="Invoice amount" value={formatMoney(invoice.amount)} testID="invoice-amount" />
      <Line label="Paid" value={formatMoney(invoice.paidAmount)} testID="invoice-paid" />
      {hasCredit(invoice) && (
        <Line label="Credit note" value={creditedRowValue(invoice.creditedAmount)} testID="invoice-credited" />
      )}
      <Line label="Still owed" value={formatMoney(invoice.outstanding)} testID="invoice-outstanding" strong />
    </MandiCard>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xs },
  label: { flexShrink: 1 },
  value: { flexShrink: 0 },
});
