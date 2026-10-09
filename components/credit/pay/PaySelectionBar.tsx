import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MandiButton, MandiStickyBar, MandiText } from '@/components/common';
import { DoublePayWarning } from '@/components/credit/DoublePayWarning';
import { barCountText, CHOOSE_INVOICES, doublePayText, limitText, OFFLINE_TEXT } from '@/lib/credit/pay/copy';
import { formatMoney, type Money } from '@/utils/money';
import { Colors, Spacing } from '@/theme';

/** The bottom bar of the picker: what is chosen, the limit note, the double-pay warning, and Pay. */
export function PaySelectionBar({
  count, total, maxInvoices, waiting, offline, busy, onPay,
}: {
  count: number;
  /** A display sum of the server's outstanding amounts; null when unreadable. */
  total: string | null;
  maxInvoices: number;
  /** Display sum of "Paid direct" reports waiting on the chosen invoices; null when there are none. */
  waiting: Money | null;
  offline: boolean;
  busy: boolean;
  onPay: () => void;
}) {
  const over = count > maxInvoices;
  const text = count === 0 ? CHOOSE_INVOICES
    : `${barCountText(count)} · ${total == null ? '—' : formatMoney(total)}`;
  return (
    <MandiStickyBar>
      {waiting != null && <DoublePayWarning testID="pay-double-warning" text={doublePayText(waiting)} />}
      {over && (
        <MandiText variant="caption" color={Colors.danger} testID="pay-limit-note" accessibilityLiveRegion="polite">
          {limitText(maxInvoices)}
        </MandiText>
      )}
      {offline && <MandiText variant="caption" color={Colors.textSecondary}>{OFFLINE_TEXT}</MandiText>}
      <View style={styles.row}>
        <MandiText variant="bodyEmphasis" style={styles.text} testID="pay-bar-text">{text}</MandiText>
        <MandiButton
          testID="pay-bar-button"
          label="Pay"
          loading={busy}
          disabled={count === 0 || over || offline}
          onPress={onPay}
          fullWidth={false}
        />
      </View>
    </MandiStickyBar>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  text: { flex: 1 },
});
