import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MandiText } from '@/components/common';
import type { CreditStatementLine } from '@/models/credit';
import { lineDay, signedAmount, statementDetail } from '@/lib/credit/statement';
import { formatMoney } from '@/utils/money';
import { Colors, Spacing, TouchTarget } from '@/theme';

/**
 * One line of a credit statement: date and the server's label on the left, the signed
 * amount with what was owed after it on the right. A repayment is told apart by its
 * minus sign and the word "Repayment", never by colour.
 */
export function CreditStatementRow({
  line, last = false, onPress,
}: {
  line: CreditStatementLine;
  last?: boolean;
  onPress?: () => void;
}) {
  const detail = statementDetail(line);
  const amount = signedAmount(line.amount);
  const owed = `Owed ${formatMoney(line.owedAfter)} after`;
  const day = lineDay(line.at);
  const body = (
    <View style={[styles.row, !last && styles.rule]}>
      <View style={styles.left}>
        <MandiText variant="caption" muted>{day}</MandiText>
        <MandiText variant="bodyEmphasis" numberOfLines={2}>{line.label}</MandiText>
        {detail !== '' && <MandiText variant="caption" muted numberOfLines={2}>{detail}</MandiText>}
      </View>
      <View style={styles.right}>
        <MandiText variant="price">{amount}</MandiText>
        <MandiText variant="caption" muted>{owed}</MandiText>
      </View>
    </View>
  );
  const label = `${day}, ${line.label}, ${amount}${detail ? `, ${detail}` : ''}, ${owed}`;
  if (onPress == null) {
    return <View accessible accessibilityLabel={label} testID="statement-row">{body}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. Open`}
      testID="statement-row"
      style={({ pressed }) => pressed && styles.pressed}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    minHeight: TouchTarget.min,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.screenHorizontal,
    backgroundColor: Colors.surface,
  },
  rule: { borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  left: { flex: 1, gap: 2 },
  right: { alignItems: 'flex-end', gap: 2 },
  pressed: { backgroundColor: Colors.surfaceSunken },
});
