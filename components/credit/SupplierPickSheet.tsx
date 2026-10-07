import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MandiBottomSheet, MandiText } from '@/components/common';
import { agreementName } from '@/lib/credit/overview';
import type { CreditAgreement } from '@/models/credit';
import { formatMoney } from '@/utils/money';
import { Colors, Spacing, TouchTarget } from '@/theme';

/** Choose which supplier to pay when several are owed. Rows arrive already sorted. */
export function SupplierPickSheet({
  visible,
  onClose,
  agreements,
  onPick,
  title = 'Pay which supplier?',
}: {
  visible: boolean;
  onClose: () => void;
  agreements: CreditAgreement[];
  onPick: (agreement: CreditAgreement) => void;
  title?: string;
}) {
  return (
    <MandiBottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
      closeLabel="Close supplier list"
      testID="supplier-pick-sheet"
    >
      <View style={styles.list}>
        {agreements.map((a) => {
          const name = agreementName(a);
          const overdue = Number(a.overdue) > 0;
          return (
            <Pressable
              key={a.id}
              testID={`pick-supplier-${a.id}`}
              accessibilityRole="button"
              accessibilityLabel={`${name}, owed ${formatMoney(a.due)}${overdue ? `, ${formatMoney(a.overdue)} overdue` : ''}`}
              onPress={() => onPick(a)}
              style={styles.row}
            >
              <MandiText variant="bodyEmphasis" numberOfLines={1}>{name}</MandiText>
              <MandiText variant="caption" color={Colors.textSecondary}>
                {`Owed ${formatMoney(a.due)}`}
              </MandiText>
              {overdue && (
                <MandiText variant="captionEmphasis" color={Colors.danger}>
                  {`${formatMoney(a.overdue)} overdue`}
                </MandiText>
              )}
            </Pressable>
          );
        })}
      </View>
    </MandiBottomSheet>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.sm },
  row: {
    minHeight: TouchTarget.min,
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
  },
});
