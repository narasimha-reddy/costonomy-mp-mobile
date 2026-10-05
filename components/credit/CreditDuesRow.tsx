import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MandiCard, MandiStatusChip, MandiText } from '@/components/common';
import { reportedLine } from '@/lib/credit/claims';
import { agreementName } from '@/lib/credit/overview';
import type { CreditAgreement } from '@/models/credit';
import { formatDay } from '@/utils/dateRange';
import { formatMoney } from '@/utils/money';
import { Colors, Spacing } from '@/theme';

/** One supplier the restaurant owes. Overdue is always words as well as colour. */
export function CreditDuesRow({
  agreement,
  onPress,
}: {
  agreement: CreditAgreement;
  onPress: () => void;
}) {
  const name = agreementName(agreement);
  const overdue = Number(agreement.overdue) > 0;
  const suspended = !overdue && agreement.status === 'SUSPENDED';
  const next =
    agreement.nextDueDate != null && agreement.nextDueAmount != null
      ? `Next ${formatMoney(agreement.nextDueAmount)} on ${formatDay(agreement.nextDueDate) ?? agreement.nextDueDate}`
      : null;
  const owed = `Owed ${formatMoney(agreement.due)}`;
  const status = overdue ? 'Overdue' : suspended ? 'Suspended' : null;
  const reported = reportedLine(agreement.openClaimsAmount);

  return (
    <MandiCard
      testID={`dues-row-${agreement.id}`}
      onPress={onPress}
      accentColor={overdue || suspended ? Colors.danger : undefined}
      accessibilityLabel={[name, owed, status, next, reported].filter(Boolean).join(', ')}
    >
      <View style={styles.row}>
        <MandiText variant="bodyEmphasis" style={styles.name}>{name}</MandiText>
        {status != null && <MandiStatusChip label={status} tone="danger" size="sm" />}
      </View>
      <MandiText variant="caption" color={Colors.textSecondary}>{owed}</MandiText>
      {next != null && <MandiText variant="caption" color={Colors.textSecondary}>{next}</MandiText>}
      {reported != null && (
        <MandiText variant="caption" color={Colors.textSecondary} testID={`dues-reported-${agreement.id}`}>
          {reported}
        </MandiText>
      )}
      {suspended && agreement.suspensionReason ? (
        <MandiText variant="caption" color={Colors.danger} numberOfLines={1}>
          {agreement.suspensionReason}
        </MandiText>
      ) : null}
    </MandiCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  name: { flex: 1 },
});
