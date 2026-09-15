import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { SupplierOrder } from '@/models/procurement';
import { MandiCard, MandiCountdown, MandiText } from '@/components/common';
import { formatMoney } from '@/utils/money';
import { Colors, Spacing } from '@/theme';

/**
 * An order awaiting this store's answer. Doc 05 §24 — "urgent acceptance items
 * must be visually prioritized".
 *
 * <p>The countdown runs to the server's `acceptanceDeadline`, recomputed from
 * that instant on every tick. A local timer started when the card mounted would
 * drift from the deadline the backend actually enforces, and this is the one
 * number the supplier is making a decision against.
 */
export function PendingOrderCard({
  order,
  onPress,
}: {
  order: SupplierOrder;
  onPress: () => void;
}) {
  return (
    <MandiCard onPress={onPress} outlined accentColor={Colors.primary}>
      <View style={styles.row}>
        <View style={styles.text}>
          <MandiText variant="bodyEmphasis">
            {order.items.length} item{order.items.length === 1 ? '' : 's'}
          </MandiText>
          <MandiText variant="caption" color={Colors.textSecondary}>
            {order.orderNumber}
          </MandiText>
        </View>
        <MandiCountdown
          deadlineAt={order.acceptanceDeadline}
          slaSeconds={order.responseSlaSeconds ?? undefined}
        />
      </View>
      <View style={styles.row}>
        <MandiText variant="caption" color={Colors.textSecondary}>Order value</MandiText>
        <MandiText variant="price">{formatMoney(order.totalAmount)}</MandiText>
      </View>
    </MandiCard>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  text: { flex: 1, gap: Spacing.xs },
});
