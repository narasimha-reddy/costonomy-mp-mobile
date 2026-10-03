import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiStatusChip } from '@/components/common/MandiStatusChip';
import { accountLine, rowLabel, rowTitle } from '@/lib/wallet/entryCopy';
import { entryKey, formatRupees, presentEntry } from '@/lib/wallet/history';
import { historyTime } from '@/lib/wallet/relativeTime';
import type { WalletEntry } from '@/models/wallet';
import { WalletColors, WalletLayout, WalletType } from '@/theme';

/**
 * One line of the wallet's history: the avatar (an orange tile with a down arrow for money
 * in, a grey disc with an up arrow for money out), a small label over the title, how long
 * ago, and on the right the amount over "Debited from wallet" with the wallet glyph.
 *
 * <p>The amount is green with a "+ " when money came in, plain when it went out, and plain
 * when it was returned (see `presentEntry`). A failed, in-progress or returned row also
 * carries its status chip under the time, which makes that one row taller.
 *
 * <p>With `onPress` the whole row is a button (to the entry's detail screen); without it,
 * it is just a row. Rows are separated by a hairline inset to the text, except the `last`
 * of a group.
 */
export function TransactionRow({
  entry, now, last = false, onPress,
}: {
  entry: WalletEntry;
  now?: Date;
  /** The last row of a group has no rule under it. */
  last?: boolean;
  onPress?: () => void;
}) {
  const view = presentEntry(entry);
  const credit = entry.direction === 'CREDIT';
  const amountColor = view.tone === 'credit' ? WalletColors.credit : WalletColors.ink;
  const label = rowLabel(entry);
  const title = rowTitle(entry);
  const when = historyTime(entry.at, now);
  const account = accountLine(entry);
  const amount = `${view.sign === '+' ? '+ ' : ''}${formatRupees(entry.amount)}`;

  const content = (
    <>
      {credit ? (
        <View style={[styles.avatar, styles.avatarIn]} testID="avatar-in">
          <Ionicons
            name="arrow-down-outline"
            size={WalletLayout.avatarArrow}
            color={WalletColors.white}
            style={styles.rotated}
          />
        </View>
      ) : (
        <View style={[styles.avatar, styles.avatarOut]} testID="avatar-out">
          <Ionicons
            name="arrow-up-outline"
            size={WalletLayout.avatarArrow}
            color={WalletColors.ink}
            style={styles.rotated}
          />
        </View>
      )}
      <View style={styles.body}>
        <View style={styles.line1}>
          <View style={styles.names}>
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">{title}</Text>
          </View>
          <Text style={[styles.amount, { color: amountColor }]}>{amount}</Text>
        </View>
        <View style={styles.line2}>
          <Text style={styles.meta}>{when}</Text>
          <View style={styles.account}>
            <Text style={styles.accountText}>{account}</Text>
            <Ionicons name="wallet-outline" size={WalletLayout.accountIcon} color={WalletColors.account} />
          </View>
        </View>
        {view.chip != null && (
          <View style={styles.chip}>
            <MandiStatusChip label={view.chip.label} tone={view.chip.tone} size="sm" />
          </View>
        )}
      </View>
    </>
  );

  // Read out as one sentence; the pieces are not separate stops.
  const spoken = `${label} ${title}, ${amount}, ${when}, ${account}`
    + (view.chip != null ? `, ${view.chip.label}` : '');

  return (
    <View testID={`entry-${entryKey(entry)}`}>
      {onPress != null ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={spoken}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          {content}
        </Pressable>
      ) : (
        <View style={styles.row} accessible accessibilityLabel={spoken}>{content}</View>
      )}
      {!last && <View style={styles.divider} testID="row-divider" />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: WalletLayout.rowHeight,
    paddingLeft: WalletLayout.rowLeft,
    paddingRight: WalletLayout.rowRight,
    backgroundColor: WalletColors.background,
  },
  pressed: { backgroundColor: WalletColors.rowPressed },
  avatar: {
    width: WalletLayout.avatar,
    height: WalletLayout.avatar,
    marginTop: WalletLayout.rowTop,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOut: { borderRadius: WalletLayout.avatar / 2, backgroundColor: WalletColors.avatarCircle },
  avatarIn: { borderRadius: WalletLayout.avatarMoneyInRadius, backgroundColor: WalletColors.orange },
  rotated: { transform: [{ rotate: '45deg' }] },
  body: { flex: 1, marginLeft: WalletLayout.textGap },
  line1: { flexDirection: 'row', alignItems: 'flex-start' },
  names: { flex: 1, marginRight: WalletLayout.nameAmountGap },
  label: { ...WalletType.rowLabel, marginTop: WalletLayout.labelTop, color: WalletColors.label },
  name: { ...WalletType.rowName, marginTop: WalletLayout.nameTop, color: WalletColors.ink },
  amount: {
    ...WalletType.rowAmount,
    marginTop: WalletLayout.amountTop,
    flexShrink: 0,
  },
  line2: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: WalletLayout.metaTop,
  },
  meta: { ...WalletType.rowMeta, color: WalletColors.meta },
  account: { flexDirection: 'row', alignItems: 'center', gap: WalletLayout.accountGap },
  accountText: { ...WalletType.rowAccount, color: WalletColors.account },
  chip: { alignItems: 'flex-start', marginTop: 6, paddingBottom: 12 },
  divider: {
    height: 1,
    marginLeft: WalletLayout.dividerInset,
    backgroundColor: WalletColors.divider,
  },
});
