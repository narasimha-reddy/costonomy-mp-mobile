import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MandiButton, MandiStickyBar } from '@/components/common';
import { formatMoney, type Money } from '@/utils/money';
import { Spacing } from '@/theme';

/**
 * The pinned actions for a supplier: "Pay" (online or from the wallet, when either is on)
 * and "Paid direct" (a payment made outside the app, offered while something is owed and
 * online payment is off). Renders nothing when nothing is owed. `due` is the server's figure for
 * what is owed to this supplier.
 */
export function CreditStickyPayBar({
  due,
  disabled = false,
  showPay = true,
  online = false,
  onPress,
  onClaim: claim,
}: {
  due: Money | number;
  disabled?: boolean;
  /** Whether paying is on (the wallet, or online). */
  showPay?: boolean;
  /** Online payment is on: "Paid direct" is never shown, whatever handler is passed. */
  online?: boolean;
  onPress?: () => void;
  onClaim?: () => void;
}) {
  if (!(Number(due) > 0)) return null;
  const onClaim = online ? undefined : claim;
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
              accessibilityHint={disabled ? 'Not available while you are offline' : online ? 'Pays this supplier online' : 'Pays this supplier from your wallet'}
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
