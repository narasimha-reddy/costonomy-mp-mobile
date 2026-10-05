import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiText } from '@/components/common';
import { GradientHero } from '@/components/common/GradientHero';
import { creditMeter } from '@/lib/credit/overview';
import { splitBalance } from '@/lib/wallet/display';
import type { CreditSummary } from '@/models/credit';
import { formatMoney } from '@/utils/money';
import { Colors, IconSize, Radius, Spacing } from '@/theme';

/**
 * What the restaurant owes, on the same orange card as the wallet's balance.
 *
 * <p>The figure is what is due; an overdue pill (words and an icon, never colour
 * alone) appears only when something is overdue; the bar is the share of the
 * approved limit in use, with what is still available to order on its left and
 * the limit on its right. Every number is the server's.
 */
export function CreditHero({ summary }: { summary: CreditSummary }) {
  const owes = Number(summary.due) > 0;
  const overdue = owes && Number(summary.overdue) > 0;
  const split = splitBalance(owes ? summary.due : 0);
  const meter = creditMeter(summary.approvedLimit, summary.available);

  const spoken = [
    owes ? `You owe ${formatMoney(summary.due)}` : 'Nothing owed',
    overdue ? `${formatMoney(summary.overdue)} overdue` : null,
    `${formatMoney(summary.available)} available to order of ${formatMoney(summary.approvedLimit)} limit`,
  ].filter(Boolean).join(', ');

  return (
    <GradientHero
      testID="credit-hero"
      label={owes ? 'You owe' : 'Nothing owed'}
      split={split}
      accessibilityLabel={spoken}
      meter={meter == null ? null : {
        percent: meter.percent,
        leftLabel: `Available to order ${formatMoney(summary.available, true)}`,
        rightLabel: `Limit ${formatMoney(summary.approvedLimit, true)}`,
        accessibilityLabel: spoken,
      }}
    >
      {overdue && (
        <View style={styles.pill} testID="credit-hero-overdue">
          <Ionicons name="alert-circle" size={IconSize.sm} color={Colors.danger} />
          <MandiText variant="captionEmphasis" color={Colors.danger}>
            {`${formatMoney(summary.overdue, true)} overdue`}
          </MandiText>
        </View>
      )}
    </GradientHero>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    backgroundColor: Colors.white,
  },
});
