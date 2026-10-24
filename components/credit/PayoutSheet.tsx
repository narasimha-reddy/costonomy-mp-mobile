import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiBottomSheet, MandiText } from '@/components/common';
import { PAYOUT_EXPLANATION, payoutStatusLabel } from '@/lib/credit/payouts';
import type { CreditPayout } from '@/models/credit';
import { formatDay } from '@/utils/dateRange';
import { formatGstRate, formatMoney } from '@/utils/money';
import { Colors, IconSize, Spacing } from '@/theme';

const PAID_EXPLANATION =
  'This is money your restaurant paid from their Mandi wallet. We paid it to you in a settlement.';

/**
 * What one payout covers: the invoices, the three figures the server sent (paid, Mandi
 * fee, what you get), which settlement, and a plain line on what it is.
 */
export function PayoutSheet({
  payout, visible, onClose, onCopy,
}: {
  payout: CreditPayout | null;
  visible: boolean;
  onClose: () => void;
  onCopy: (settlementNumber: string) => void;
}) {
  if (payout == null) return null;
  const name = payout.restaurantName ?? payout.outletName ?? 'A restaurant';
  const paidOut = payout.status === 'APPLIED';
  const number = payout.settlementNumber;
  const rate = payout.commissionRatePercent == null ? '' : ` (${formatGstRate(payout.commissionRatePercent)})`;

  return (
    <MandiBottomSheet
      visible={visible}
      onClose={onClose}
      title="Payout details"
      closeLabel="Close"
      testID="payout-sheet"
    >
      <View style={styles.body}>
        <View>
          <MandiText variant="bodyEmphasis">{name}</MandiText>
          <MandiText variant="caption" color={Colors.textSecondary}>{payoutStatusLabel(payout.status)}</MandiText>
        </View>

        <View style={styles.facts}>
          <Fact id="sheet-gross" label="Restaurant paid" value={formatMoney(payout.grossAmount)} />
          <Fact id="sheet-fee" label={`Mandi fee${rate}`} value={formatMoney(payout.commissionAmount)} />
          <Fact id="sheet-net" label="You get" value={formatMoney(payout.netAmount)} strong />
        </View>

        <View style={styles.facts}>
          <MandiText variant="captionEmphasis" color={Colors.textSecondary} accessibilityRole="header">
            Settlement
          </MandiText>
          {paidOut && number != null ? (
            <>
              <Fact id="sheet-settlement" label="Number" value={number} />
              {payout.settlementDate != null && (
                <Fact id="sheet-settlement-date" label="Date" value={formatDay(payout.settlementDate) ?? payout.settlementDate} />
              )}
              <Pressable
                testID="copy-settlement"
                onPress={() => onCopy(number)}
                accessibilityRole="button"
                accessibilityLabel="Copy settlement number"
                style={styles.copy}
              >
                <Ionicons name="copy-outline" size={IconSize.sm} color={Colors.primary} />
                <MandiText variant="bodyEmphasis" color={Colors.primary}>Copy settlement number</MandiText>
              </Pressable>
            </>
          ) : (
            <MandiText variant="body">In your next settlement</MandiText>
          )}
        </View>

        {payout.invoices.length > 0 && (
          <View style={styles.facts}>
            <MandiText variant="captionEmphasis" color={Colors.textSecondary} accessibilityRole="header">
              Invoices covered
            </MandiText>
            {payout.invoices.map((inv) => (
              <Fact
                key={inv.invoiceId}
                id={`sheet-invoice-${inv.invoiceId}`}
                label={inv.invoiceNumber}
                value={formatMoney(inv.amount)}
              />
            ))}
          </View>
        )}

        <MandiText variant="caption" color={Colors.textSecondary}>
          {paidOut ? PAID_EXPLANATION : PAYOUT_EXPLANATION}
        </MandiText>
      </View>
    </MandiBottomSheet>
  );
}

function Fact({ id, label, value, strong }: { id: string; label: string; value: string; strong?: boolean }) {
  return (
    <View testID={id} style={styles.fact} accessible accessibilityLabel={`${label}, ${value}`}>
      <MandiText variant="body" color={Colors.textSecondary} style={styles.label}>{label}</MandiText>
      <MandiText variant={strong ? 'price' : 'bodyEmphasis'} style={styles.value}>{value}</MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.lg, paddingTop: Spacing.sm },
  facts: { gap: Spacing.sm },
  fact: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md },
  label: { flexShrink: 1 },
  value: { flexShrink: 1, textAlign: 'right' },
  copy: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
});
