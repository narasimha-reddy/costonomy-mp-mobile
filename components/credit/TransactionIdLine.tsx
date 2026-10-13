import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MandiText } from '@/components/common';
import { Colors } from '@/theme';

/** "Transaction ID" and its value as selectable text, so it can be copied. Nothing without an id. */
export function TransactionIdLine({ id, testID }: { id: string | null; testID?: string }) {
  if (id == null) return null;
  return (
    <View style={styles.row} testID={testID}>
      <MandiText variant="caption" color={Colors.textTertiary}>Transaction ID</MandiText>
      <MandiText
        variant="caption"
        color={Colors.textSecondary}
        selectable
        testID={testID ? `${testID}-value` : undefined}
        style={styles.value}
      >
        {id}
      </MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 0 },
  value: { flexShrink: 1 },
});
