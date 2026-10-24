import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Colors, Radius, Spacing } from '@/theme';

/**
 * One tappable row of a grouped card (the Credit overview's lists, like the wallet's
 * Recent): padded, the whole row is the tap target (at least 44dp), and a hairline
 * under it unless it is the `last`. Used on its own it is just a row.
 */
export function CreditListRow({
  testID, onPress, accessibilityLabel, last = false, children,
}: {
  testID?: string;
  onPress: () => void;
  accessibilityLabel: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View>
      <Pressable
        testID={testID}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        {children}
      </Pressable>
      {!last && <View style={styles.divider} testID={testID ? `divider-${testID}` : undefined} />}
    </View>
  );
}

/** The white rounded card that groups the rows. */
export function CreditListCard({ children, testID }: { children: React.ReactNode; testID?: string }) {
  return <View style={styles.card} testID={testID}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.lg, overflow: 'hidden', backgroundColor: Colors.surface },
  row: {
    minHeight: 44,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.xs,
  },
  pressed: { opacity: 0.85 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.divider, marginHorizontal: Spacing.lg },
});
