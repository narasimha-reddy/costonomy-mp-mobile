import React from 'react';
import { MandiButton, MandiStickyBar } from '@/components/common';
import { formatMoney, type Money } from '@/utils/money';

/**
 * The pinned "Pay" action. Renders nothing when nothing is owed. `due` is the
 * server's figure for what is owed to this supplier.
 */
export function CreditStickyPayBar({
  due,
  disabled = false,
  onPress,
}: {
  due: Money | number;
  disabled?: boolean;
  onPress: () => void;
}) {
  if (!(Number(due) > 0)) return null;
  return (
    <MandiStickyBar>
      <MandiButton
        label={`Pay ${formatMoney(due)}`}
        onPress={onPress}
        disabled={disabled}
        fullWidth
        testID="credit-pay-bar-button"
        accessibilityHint={disabled ? 'Not available while you are offline' : 'Pays this supplier from your wallet'}
      />
    </MandiStickyBar>
  );
}
