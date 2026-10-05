import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiButton, MandiCard, MandiText } from '@/components/common';
import { CreditPosition } from '@/components/credit/CreditPosition';
import type { CreditSummary } from '@/models/credit';
import { formatMoney } from '@/utils/money';
import { Colors, IconSize, Spacing } from '@/theme';

/** What the restaurant owes, first; the limit after it. */
export function CreditOverviewHero({
  summary,
  showPay,
  payDisabled,
  onPay,
  showClaim = false,
  onClaim,
}: {
  summary: CreditSummary;
  showPay: boolean;
  payDisabled: boolean;
  onPay: () => void;
  /** Offer "I paid outside the app". */
  showClaim?: boolean;
  onClaim?: () => void;
}) {
  const owes = Number(summary.due) > 0;
  const overdue = Number(summary.overdue) > 0;
  const label = !owes
    ? 'Nothing owed'
    : `You owe ${formatMoney(summary.due)}${overdue ? `, ${formatMoney(summary.overdue)} overdue` : ''}`;

  return (
    <MandiCard testID="credit-hero">
      <View style={styles.stack}>
        <View style={styles.block} accessible accessibilityLabel={label} testID="credit-hero-summary">
          {owes ? (
            <>
              <MandiText variant="caption" color={Colors.textSecondary}>You owe</MandiText>
              <MandiText variant="display">{formatMoney(summary.due)}</MandiText>
            </>
          ) : (
            <MandiText variant="display">Nothing owed</MandiText>
          )}
          {owes && overdue && (
            <View style={styles.overdue} testID="credit-hero-overdue">
              <Ionicons name="alert-circle" size={IconSize.sm} color={Colors.creditOverdue} />
              <MandiText variant="captionEmphasis" color={Colors.creditOverdue}>
                {`${formatMoney(summary.overdue)} overdue`}
              </MandiText>
            </View>
          )}
          <MandiText variant="caption" color={Colors.textSecondary}>
            {`${formatMoney(summary.available)} available to order`}
          </MandiText>
        </View>

        <CreditPosition
          barOnly
          approvedLimit={summary.approvedLimit}
          reserved={summary.reserved}
          utilized={summary.utilized}
          available={summary.available}
          due={summary.due}
          overdue={summary.overdue}
        />

        {(showPay || (showClaim && onClaim != null)) && (
          <View style={styles.actions} testID="credit-hero-actions">
            {showPay && (
              <MandiButton
                testID="pay-from-wallet"
                label="Pay from wallet"
                onPress={onPay}
                disabled={payDisabled}
                fullWidth
              />
            )}
            {showClaim && onClaim != null && (
              <MandiButton
                testID="i-paid"
                label="I paid outside the app"
                variant="secondary"
                onPress={onClaim}
                fullWidth
              />
            )}
          </View>
        )}
    </View>
    </MandiCard>
  );
}

const styles = StyleSheet.create({
  // MandiCard stacks its children with no gap of its own, so the figures, the bar
  // and the buttons were touching. One flow column with the md token between them.
  stack: { gap: Spacing.md },
  block: { gap: Spacing.xs },
  overdue: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  actions: { gap: Spacing.md },
});
