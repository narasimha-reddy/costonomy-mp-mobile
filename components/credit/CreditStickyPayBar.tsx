import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MandiButton, MandiStickyBar } from '@/components/common';
import { formatMoney, type Money } from '@/utils/money';
import { Spacing } from '@/theme';

/**
 * The pinned actions for a supplier: "Pay" (from the wallet, when that is on) and
 * "Paid direct" (a payment made outside the app, always available while something is
 * owed). Renders nothing when nothing is owed. `due` is the server's figure for
 * what is owed to this supplier.
 */
export function CreditStickyPayBar({
  due,
  disabled = false,
  showPay = true,
  onPress,
  onClaim,
}: {
  due: Money | number;
  disabled?: boolean;
  /** Whether paying from the wallet is on. */
  showPay?: boolean;
  onPress?: () => void;
  onClaim?: () => void;
}) {
  if (!(Number(due) > 0)) return null;
  const pay = showPay && onPress != null;
  if (!pay && onClaim == null) return null;
  return (
    <MandiStickyBar>
      <View style={styles.row}>
        {pay && (
          <View style={styles.cell}>
            <MandiButton
              label={`Pay ${formatMoney(due)}`}
              onPress={onPress}
              disabled={disabled}
              fullWidth
              testID="credit-pay-bar-button"
              accessibilityHint={disabled ? 'Not available while you are offline' : 'Pays this supplier from your wallet'}
            />
          </View>
        )}
        {onClaim != null && (
          <View style={styles.cell}>
            <MandiButton
              label="Paid direct"
              variant="secondary"
              onPress={onClaim}
              fullWidth
              testID="credit-i-paid-bar-button"
              accessibilityLabel="Paid direct"
              accessibilityHint="Tell this supplier you paid them directly"
            />
          </View>
        )}
      </View>
    </MandiStickyBar>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.md },
  cell: { flex: 1 },
});
