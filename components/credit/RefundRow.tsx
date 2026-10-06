import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MandiButton, MandiCard, MandiText } from '@/components/common';
import { istDayMonth } from '@/lib/credit/istFormat';
import type { RefundDue } from '@/models/credit';
import { formatMoney } from '@/utils/money';
import { Colors, Spacing } from '@/theme';

/**
 * One refund due: the restaurant, the invoice and credit note it came from, the amount and the day.
 * An OFF_PLATFORM row is the supplier's to give back and can be marked; a WALLET row is Mandi's
 * to settle and has no action. Every figure is the server's.
 */
export function RefundRow({
  refund, canMark, offline, onMark,
}: {
  refund: RefundDue;
  canMark: boolean;
  offline: boolean;
  onMark: (refund: RefundDue) => void;
}) {
  const who = refund.restaurantName ?? refund.outletName ?? 'A restaurant';
  const created = istDayMonth(refund.createdAt);
  const open = refund.status === 'OPEN';
  const refunded = istDayMonth(refund.refundedAt);
  const wallet = refund.channel === 'WALLET';
  const spoken = [
    `${formatMoney(refund.amount)} to give back to ${who}`, refund.invoiceNumber, refund.creditNoteNumber,
    open ? null : 'refunded',
  ].filter(Boolean).join(', ');
  return (
    <MandiCard compact outlined testID={`refund-row-${refund.id}`} accessibilityLabel={spoken}>
      <View style={styles.top}>
        <MandiText variant="bodyEmphasis" style={styles.flex} numberOfLines={2}>{who}</MandiText>
        <MandiText variant="bodyEmphasis" style={styles.amount}>{formatMoney(refund.amount)}</MandiText>
      </View>
      <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={2}>
        {[refund.invoiceNumber, refund.creditNoteNumber, created].filter(Boolean).join(' · ')}
      </MandiText>
      {!open && (
        <MandiText variant="caption" color={Colors.textSecondary}>
          {refunded != null ? `Refunded ${refunded}` : 'Refunded'}
        </MandiText>
      )}
      {refund.note != null && refund.note !== '' && (
        <MandiText variant="caption" color={Colors.textTertiary} numberOfLines={3}>{refund.note}</MandiText>
      )}
      {open && wallet && (
        <MandiText variant="caption" color={Colors.textSecondary}>
          They paid from their Mandi wallet. Our team will settle this.
        </MandiText>
      )}
      {open && !wallet && canMark && (
        <MandiButton
          testID={`refund-mark-${refund.id}`}
          label="Mark as refunded"
          variant="secondary"
          size="md"
          disabled={offline}
          accessibilityLabel={`Mark ${formatMoney(refund.amount)} to ${who} as refunded`}
          onPress={() => onMark(refund)}
        />
      )}
    </MandiCard>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  amount: { flexShrink: 1, maxWidth: '50%', textAlign: 'right' },
});
