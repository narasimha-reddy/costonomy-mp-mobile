import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MandiBottomSheet } from '@/components/common/MandiBottomSheet';
import { billsPendingLine } from '@/lib/wallet/history';
import { WalletColors, WalletType } from '@/theme';

/** What the month sheet is about: the figures `monthNet` produced for one month. */
export interface MonthSheetData {
  title: string;
  moneyIn: string;
  moneyOut: string;
  /** "+ ₹826.69", "₹0" or "− ₹73.31". */
  net: string;
  credit: boolean;
  /** Payments that month still waiting for a bill; absent on an older server. */
  billsPending?: number | null;
}

export const MONTH_SHEET_NOTE =
  'Everything in your wallet that month, including refunds and returned withdrawals.';

/**
 * The small sheet behind a month band: money in, money out and the net, because the net on its
 * own does not say how the month added up. It counts everything the ledger holds for that
 * calendar month in India time, so refunds and withdrawals that were later returned sit on both
 * sides.
 */
export function MonthSheet({ data, onClose }: { data: MonthSheetData | null; onClose: () => void }) {
  return (
    <MandiBottomSheet
      visible={data != null}
      onClose={onClose}
      title={data?.title}
      closeLabel={`Close ${data?.title ?? 'month'} summary`}
    >
      {data != null && (
        <View testID="month-sheet">
          <Line label="Money in" value={data.moneyIn} />
          <Line label="Money out" value={data.moneyOut} />
          <Line label="Net" value={data.net} credit={data.credit} strong />
          {billsPendingLine(data.billsPending) != null && (
            <Line label="Bills pending" value={String(data.billsPending)} />
          )}
          <Text style={styles.note}>{MONTH_SHEET_NOTE}</Text>
        </View>
      )}
    </MandiBottomSheet>
  );
}

function Line({ label, value, credit = false, strong = false }: {
  label: string; value: string; credit?: boolean; strong?: boolean;
}) {
  return (
    <View style={styles.line} accessible accessibilityLabel={`${label} ${value}`}>
      <Text style={[styles.label, strong && styles.strong]}>{label}</Text>
      <Text style={[styles.value, strong && styles.strong, credit && styles.credit]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  label: { ...WalletType.rowName, fontSize: 16, lineHeight: 22, color: WalletColors.label },
  value: { ...WalletType.rowAmount, fontSize: 16, lineHeight: 22, color: WalletColors.ink },
  strong: { fontFamily: WalletType.rowAmount.fontFamily },
  credit: { color: WalletColors.credit },
  note: { ...WalletType.rowMeta, fontSize: 13, lineHeight: 18, color: WalletColors.meta, marginTop: 8, marginBottom: 8 },
});
