import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiStatusChip } from '@/components/common/MandiStatusChip';
import { MandiText } from '@/components/common/MandiText';
import { entryKey, presentEntry, relativeTime } from '@/lib/wallet/history';
import type { WalletEntry } from '@/models/wallet';
import { formatMoney } from '@/utils/money';
import { Colors, IconSize, Radius, Spacing } from '@/theme';

/**
 * One line of the wallet's history: a small category above a bold title, how long
 * ago, and the amount with what it was paid with underneath.
 *
 * <p>The amount is green with a plus when money came in, plain with a minus when it
 * went out, and neutral with no sign when it was returned (see `presentEntry`).
 */
export function TransactionRow({
  entry, now, last = false,
}: {
  entry: WalletEntry;
  now?: Date;
  /** The last row of a group has no rule under it. */
  last?: boolean;
}) {
  const view = presentEntry(entry);
  const amountColor = view.tone === 'credit' ? Colors.success
    : view.tone === 'neutral' ? Colors.textSecondary : Colors.textPrimary;

  return (
    <View style={[styles.row, last && styles.last]} testID={`entry-${entryKey(entry)}`}>
      <View style={styles.icon}>
        <Ionicons name="wallet-outline" size={IconSize.md} color={Colors.textSecondary} />
      </View>
      <View style={styles.body}>
        <MandiText variant="caption" color={Colors.textSecondary}>{view.category}</MandiText>
        <MandiText variant="bodyEmphasis">{view.title}</MandiText>
        <MandiText variant="caption" color={Colors.textSecondary}>
          {relativeTime(entry.at, now)}
        </MandiText>
        {view.chip != null && (
          <MandiStatusChip label={view.chip.label} tone={view.chip.tone} size="sm" />
        )}
      </View>
      <View style={styles.amount}>
        <MandiText variant="price" color={amountColor}>
          {view.sign}{formatMoney(entry.amount)}
        </MandiText>
        {view.instrumentLine != null && (
          <MandiText variant="caption" color={Colors.textSecondary} style={styles.right}>
            {view.instrumentLine}
          </MandiText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  last: { borderBottomWidth: 0 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceSunken,
  },
  body: { flex: 1, gap: 2 },
  amount: { alignItems: 'flex-end', maxWidth: '40%' },
  right: { textAlign: 'right' },
});
