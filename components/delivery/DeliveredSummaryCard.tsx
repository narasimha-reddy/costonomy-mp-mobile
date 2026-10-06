import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiButton, MandiCard, MandiText } from '@/components/common';
import { clockTime } from '@/lib/delivery/deliveryPartner';
import { Colors, IconSize, Spacing } from '@/theme';

/** What is left of the partner once the order has arrived: when, and by whom. No call button. */
export function DeliveredSummaryCard({
  deliveredAt, driverName, audience, onReceive,
}: {
  deliveredAt?: string | null;
  driverName?: string | null;
  audience: 'buyer' | 'supplier';
  onReceive?: () => void;
}) {
  const at = clockTime(deliveredAt);
  return (
    <MandiCard accentColor={Colors.success}>
      <View style={styles.row}>
        <Ionicons name="checkmark-circle" size={IconSize.lg} color={Colors.success} />
        <View style={styles.text}>
          <MandiText variant="bodyEmphasis">{at ? `Delivered at ${at}` : 'Delivered'}</MandiText>
          {driverName ? (
            <MandiText variant="caption" color={Colors.textSecondary}>{`Delivered by ${driverName}`}</MandiText>
          ) : null}
        </View>
      </View>
      {audience === 'buyer' && onReceive && (
        <View style={styles.action}>
          <MandiButton label="Inspect and receive goods" size="md" onPress={onReceive} />
        </View>
      )}
    </MandiCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  text: { flex: 1, gap: 2 },
  action: { marginTop: Spacing.md },
});
