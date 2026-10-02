import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MandiCard, MandiStatusChip, MandiText } from '@/components/common';
import { entryLabel, withdrawalProgress } from '@/lib/wallet/entryCopy';
import type { WalletEntry } from '@/models/wallet';
import { formatMoney } from '@/utils/money';
import { formatMomentWithRecency } from '@/utils/dateRange';
import { Colors, Spacing } from '@/theme';

/** One statement line: what moved, when, what the balance became, and a withdrawal's progress. */
export function EntryRow({ entry }: { entry: WalletEntry }) {
  const progress = withdrawalProgress(entry);
  return (
    <MandiCard>
      <View style={styles.row}>
        <MandiText variant="bodyEmphasis">{entryLabel(entry)}</MandiText>
        <MandiText
          variant="price"
          color={entry.direction === 'CREDIT' ? Colors.success : Colors.textPrimary}
        >
          {entry.direction === 'CREDIT' ? '+' : '−'}{formatMoney(entry.amount)}
        </MandiText>
      </View>
      <View style={styles.row}>
        <MandiText variant="caption" color={Colors.textSecondary}>
          {formatMomentWithRecency(entry.at)} · balance {formatMoney(entry.balanceAfter)}
        </MandiText>
        {progress != null && (
          <MandiStatusChip label={progress.label} tone={progress.tone} size="sm" />
        )}
      </View>
    </MandiCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
});
