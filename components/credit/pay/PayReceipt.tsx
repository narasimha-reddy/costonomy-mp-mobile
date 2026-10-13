import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MandiCard, MandiText } from '@/components/common';
import { TransactionIdLine } from '@/components/credit/TransactionIdLine';
import { receiptFooter } from '@/lib/credit/pay/copy';
import type { CreditPayAttempt } from '@/models/creditPay';
import { formatMoney } from '@/utils/money';
import { Colors, Spacing } from '@/theme';

/** What was paid: each supplier with the invoices it covered, then how and when. Every figure the server's. */
export function PayReceipt({ attempt }: { attempt: CreditPayAttempt }) {
  return (
    <MandiCard testID="pay-receipt">
      <View style={styles.body}>
        {attempt.suppliers.map((s) => (
          <View key={s.agreementId} style={styles.supplier}>
            <View style={styles.line}>
              <MandiText variant="bodyEmphasis" style={styles.flex}>{s.supplierName}</MandiText>
              <MandiText variant="bodyEmphasis">{formatMoney(s.paidAmount)}</MandiText>
            </View>
            {attempt.invoices.filter((i) => i.agreementId === s.agreementId).map((i) => (
              <View key={i.invoiceId} style={styles.line}>
                <MandiText variant="caption" color={Colors.textSecondary} style={styles.flex}>
                  {i.outcome === 'SKIPPED' ? `${i.invoiceNumber} · not paid` : i.invoiceNumber}
                </MandiText>
                <MandiText variant="caption" color={Colors.textSecondary}>{formatMoney(i.amount)}</MandiText>
              </View>
            ))}
          </View>
        ))}
        <MandiText variant="caption" color={Colors.textSecondary}>{receiptFooter(attempt)}</MandiText>
        <TransactionIdLine id={attempt.razorpayPaymentId ?? (attempt.walletEntryId != null ? String(attempt.walletEntryId) : null)} testID="receipt-txid" />
      </View>
    </MandiCard>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.md },
  supplier: { gap: Spacing.xs },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md },
  flex: { flex: 1 },
});
