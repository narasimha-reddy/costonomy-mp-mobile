import React, { useCallback, useMemo, useState } from 'react';
import {
  Pressable, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiStatusChip } from '@/components/common/MandiStatusChip';
import { BillStatusChip } from '@/components/wallet/BillStatusChip';
import {
  TIME_CHIP_GAP, billChipCopy, chipWidth, chooseBillChip, estimateTextWidth, initialTimeLineWidth,
} from '@/lib/wallet/billChip';
import { accountLine, rowLabel, rowTitle } from '@/lib/wallet/entryCopy';
import { entryKey, formatRupees, presentEntry } from '@/lib/wallet/history';
import { historyTime } from '@/lib/wallet/relativeTime';
import type { WalletEntry } from '@/models/wallet';
import { BillChipLayout, WalletColors, WalletLayout, WalletType } from '@/theme';

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
 *
 * <p>A payment that needs a bill (`entry.bill`) also carries a small status chip on the time
 * line, so the row keeps its height. Without a bill the row is drawn exactly as it always was.
 */
function TransactionRowBase({
  entry, now, last = false, onPress, onBillPress, mayAddBill = false,
}: {
  entry: WalletEntry;
  now?: Date;
  /** The last row of a group has no rule under it. */
  last?: boolean;
  onPress?: (entry: WalletEntry) => void;
  /** Taps on the bill chip: Add bill when pending, otherwise the bill itself. */
  onBillPress?: (entry: WalletEntry) => void;
  /** Whether the user may add a bill; a pending chip is only a button for them. */
  mayAddBill?: boolean;
}) {
  const view = presentEntry(entry);
  const credit = entry.direction === 'CREDIT';
  const amountColor = view.tone === 'credit' ? WalletColors.credit : WalletColors.ink;
  const label = rowLabel(entry);
  const title = rowTitle(entry);
  const when = historyTime(entry.at, now);
  const account = accountLine(entry);
  const amount = `${view.sign === '+' ? '+ ' : ''}${formatRupees(entry.amount)}`;

  // A credit repayment never takes a bill, whatever the server says.
  const billStatus = entry.kind === 'CREDIT_REPAYMENT' ? null : entry.bill?.status ?? null;
  // Viewing a bill needs no permission; adding one does.
  const chipTappable = billStatus != null && onBillPress != null
    && (billStatus !== 'PENDING' || mayAddBill);
  const openBill = chipTappable ? () => onBillPress(entry) : undefined;

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
        {billStatus != null ? (
          <TimeAndBillLine
            when={when}
            account={account}
            status={billStatus}
            onBillPress={openBill}
            roomBelow={view.chip == null}
          />
        ) : (
          <View style={styles.line2}>
            <Text style={styles.meta}>{when}</Text>
            <View style={styles.account}>
              <Text style={styles.accountText}>{account}</Text>
              <Ionicons name="wallet-outline" size={WalletLayout.accountIcon} color={WalletColors.account} />
            </View>
          </View>
        )}
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
    + (view.chip != null ? `, ${view.chip.label}` : '')
    + (billStatus != null ? `, ${billChipCopy(billStatus).full}` : '');

  return (
    <View testID={`entry-${entryKey(entry)}`}>
      {onPress != null ? (
        <Pressable
          onPress={() => onPress(entry)}
          accessibilityRole="button"
          accessibilityLabel={spoken}
          // A button inside a button is not reachable on iOS, so the chip's tap is offered as an action.
          accessibilityActions={chipTappable
            ? [{ name: 'bill', label: billStatus === 'PENDING' ? 'Add bill' : 'Open bill' }]
            : undefined}
          onAccessibilityAction={chipTappable ? (e) => {
            if (e.nativeEvent.actionName === 'bill') openBill?.();
          } : undefined}
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

export const TransactionRow = React.memo(TransactionRowBase);

function useRoundedWidth(): [number | null, (e: LayoutChangeEvent) => void] {
  const [width, setWidth] = useState<number | null>(null);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    setWidth((prev) => (prev === w ? prev : w));
  }, []);
  return [width, onLayout];
}

/**
 * The second line of a row with a bill: the time and the bill chip side by side, then the
 * account. The chip's shape is chosen from the measured width of the time's share of the line
 * (estimated until measured) so it never wraps and the line never grows.
 *
 * <p>What gives way when room runs out, in order: the chip's words (full, then short, then the
 * icon alone), then the account words ("Debited from wal…"). The time is never cut for either:
 * its share of the line is at least the whole time plus the icon, unless the row itself is
 * narrower than that.
 */
function TimeAndBillLine({ when, account, status, onBillPress, roomBelow }: {
  when: string;
  account: string;
  status: NonNullable<WalletEntry['bill']>['status'];
  onBillPress?: () => void;
  /**
   * Nothing sits under this line (no status chip), so the chip's lower overhang needs room of its
   * own: with big text the row is only as tall as its words, and the next row would cover it.
   */
  roomBelow: boolean;
}) {
  const { width, fontScale } = useWindowDimensions();
  const [rowWidth, onRowLayout] = useRoundedWidth();
  const [lineWidth, onLineLayout] = useRoundedWidth();
  const variant = useMemo(() => chooseBillChip({
    lineWidth: lineWidth ?? initialTimeLineWidth(width, fontScale),
    timeText: when, fontScale, status,
  }), [lineWidth, width, fontScale, when, status]);
  const minLine = useMemo(() => {
    const body = rowWidth ?? (width - WalletLayout.rowLeft - WalletLayout.avatar
      - WalletLayout.textGap - WalletLayout.rowRight);
    const time = estimateTextWidth(when, WalletType.rowMeta.fontSize * fontScale, 'regular');
    return Math.max(0, Math.min(
      time + TIME_CHIP_GAP + chipWidth('icon', status, fontScale),
      body - BillChipLayout.timeGap,
    ));
  }, [rowWidth, width, fontScale, when, status]);
  return (
    <View style={[styles.line2, roomBelow && styles.chipOverhang]} onLayout={onRowLayout} testID="row-bill-line">
      <View style={[styles.timeLine, { minWidth: minLine }]} onLayout={onLineLayout} testID="row-time-line">
        <Text style={[styles.meta, styles.timeText]} numberOfLines={1} ellipsizeMode="tail">{when}</Text>
        <View style={styles.billChip} testID="row-bill-chip">
          <BillStatusChip status={status} variant={variant} onPress={onBillPress} nested />
        </View>
      </View>
      <View style={[styles.account, styles.accountYields]}>
        <Text style={[styles.accountText, styles.accountTextYields]} numberOfLines={1} ellipsizeMode="tail">
          {account}
        </Text>
        <Ionicons name="wallet-outline" size={WalletLayout.accountIcon} color={WalletColors.account} />
      </View>
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
  timeLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: BillChipLayout.timeGap,
  },
  // The row's minimum height already covers this at normal text sizes, so the row only grows
  // (by at most this much) when big text has made it as tall as its words.
  chipOverhang: { marginBottom: (BillChipLayout.height - WalletType.rowMeta.lineHeight) / 2 },
  // On a row with a bill the account words give way before the time does.
  accountYields: { flexShrink: 1, minWidth: 0, overflow: 'hidden' },
  accountTextYields: { flexShrink: 1 },
  timeText: { flexShrink: 1 },
  // The chip is taller than the text line; the margin keeps the line box at its old height.
  billChip: {
    flexShrink: 0,
    marginLeft: BillChipLayout.timeGap,
    marginVertical: (WalletType.rowMeta.lineHeight - BillChipLayout.height) / 2,
  },
  account: { flexDirection: 'row', alignItems: 'center', gap: WalletLayout.accountGap },
  accountText: { ...WalletType.rowAccount, color: WalletColors.account },
  chip: { alignItems: 'flex-start', marginTop: 6, paddingBottom: 12 },
  divider: {
    height: 1,
    marginLeft: WalletLayout.dividerInset,
    backgroundColor: WalletColors.divider,
  },
});
