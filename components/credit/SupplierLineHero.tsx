import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiText } from '@/components/common';
import { GradientHero } from '@/components/common/GradientHero';
import { creditMeter } from '@/lib/credit/overview';
import { splitBalance } from '@/lib/wallet/display';
import type { CreditAgreement } from '@/models/credit';
import { formatMoney } from '@/utils/money';
import { Colors, IconSize, Radius, Spacing } from '@/theme';

/**
 * What one restaurant owes this store, on the same orange card as the restaurant's hero.
 *
 * <p>The four figures are the server's: owed (`due`), overdue, available to them and on
 * hold (`reserved`). An overdue pill appears only when something is overdue, in words and
 * an icon. Nothing here is added up.
 */
export function SupplierLineHero({ agreement }: { agreement: CreditAgreement }) {
  const owes = Number(agreement.due) > 0;
  const overdue = owes && Number(agreement.overdue) > 0;
  const split = splitBalance(owes ? agreement.due : 0);
  const meter = creditMeter(agreement.approvedLimit, agreement.available);
  const spoken = [
    owes ? `They owe you ${formatMoney(agreement.due)}` : 'Nothing owed',
    overdue ? `${formatMoney(agreement.overdue)} overdue` : null,
    `${formatMoney(agreement.available)} available to them of ${formatMoney(agreement.approvedLimit)} limit`,
    `${formatMoney(agreement.reserved)} on hold`,
  ].filter(Boolean).join(', ');

  return (
    <GradientHero
      testID="line-hero"
      label={owes ? 'They owe you' : 'Nothing owed'}
      split={split}
      accessibilityLabel={spoken}
      meter={meter == null ? null : {
        percent: meter.percent,
        leftLabel: `Available to them ${formatMoney(agreement.available, true)}`,
        rightLabel: `Limit ${formatMoney(agreement.approvedLimit, true)}`,
        accessibilityLabel: spoken,
      }}
    >
      {overdue && (
        <View style={styles.pill} testID="line-hero-overdue">
          <Ionicons name="alert-circle" size={IconSize.sm} color={Colors.danger} />
          <MandiText variant="captionEmphasis" color={Colors.danger}>
            {`${formatMoney(agreement.overdue, true)} overdue`}
          </MandiText>
        </View>
      )}
      <MandiText variant="caption" color={Colors.onGradientMuted} testID="line-hero-hold">
        {`On hold for orders in progress ${formatMoney(agreement.reserved, true)}`}
      </MandiText>
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
