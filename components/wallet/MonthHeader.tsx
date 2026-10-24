import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WalletColors, WalletLayout, WalletType } from '@/theme';

/**
 * The grey band over a month's rows: "October 2026 ........ + ₹48,876 >". `amount` is the
 * month's net movement as the server's totals give it (see `monthNet`); `credit` makes it
 * green. Absent, the band is the name alone. `stuck` is the band that is pinned to the top
 * of the list: it carries a hairline above it. With an amount and `onPress` the whole band is a
 * button that opens the month's detail (money in, money out, net).
 */
export function MonthHeader({
  title, amount, credit = false, stuck = false, onPress,
}: {
  title: string;
  amount: string | null;
  credit?: boolean;
  stuck?: boolean;
  onPress?: () => void;
}) {
  const label = amount != null ? `${title}, ${amount}` : title;
  const content = (
    <>
      <Text style={styles.title}>{title}</Text>
      {amount != null && (
        <>
          <Text style={[styles.amount, credit && styles.credit]}>{amount}</Text>
          <Ionicons name="chevron-forward" size={WalletLayout.chevron} color={WalletColors.chevron} />
        </>
      )}
    </>
  );
  if (amount != null && onPress != null) {
    return (
      <Pressable
        style={({ pressed }) => [styles.bar, stuck && styles.stuck, pressed && styles.pressed]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}. Show how this month adds up`}
        testID={`month-${title}`}
      >
        {content}
      </Pressable>
    );
  }
  return (
    <View
      style={[styles.bar, stuck && styles.stuck]}
      accessibilityRole="header"
      accessibilityLabel={label}
      testID={`month-${title}`}
    >
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: WalletLayout.bandHeight,
    paddingLeft: WalletLayout.bandLeft,
    paddingRight: WalletLayout.bandRight,
    backgroundColor: WalletColors.bandBackground,
    borderTopWidth: 1,
    borderTopColor: WalletColors.bandBackground,
  },
  stuck: { borderTopColor: WalletColors.bandHairline },
  pressed: { backgroundColor: WalletColors.rowPressed },
  title: { ...WalletType.bandLabel, flex: 1, color: WalletColors.bandLabel },
  amount: {
    ...WalletType.bandAmount,
    marginRight: WalletLayout.bandAmountGap,
    color: WalletColors.ink,
  },
  credit: { color: WalletColors.credit },
});
