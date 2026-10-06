import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MandiText } from '@/components/common';
import { limitMeter, splitBalance } from '@/lib/wallet/display';
import type { Wallet } from '@/models/wallet';
import { Colors, Radius, Spacing, TextStyles } from '@/theme';

/**
 * The wallet's balance, big, with a thin bar for how much of the month's top-up
 * allowance is used.
 *
 * <p>The ₹ is small, the rupees large and the paise smaller, so the figure reads
 * at a glance and the paise do not shout. The bar and its two labels appear only
 * when the server sent limits; on an older API there is simply no meter, never an
 * invented one.
 */
export function WalletHero({ wallet }: { wallet: Wallet }) {
  const split = splitBalance(wallet.balance);
  const meter = limitMeter(wallet.limits);

  return (
    <LinearGradient
      colors={[Colors.gradientStart, Colors.gradientEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.hero}
    >
      <MandiText variant="caption" color={Colors.onGradientMuted}>Wallet balance</MandiText>

      {split == null ? (
        <MandiText variant="display" color={Colors.onGradient}>—</MandiText>
      ) : (
        <View
          style={styles.amountRow}
          accessible
          accessibilityLabel={`Wallet balance ${split.negative ? 'minus ' : ''}${split.rupees} rupees ${split.paise} paise`}
        >
          <MandiText variant="subtitle" color={Colors.onGradient} style={styles.symbol}>
            {split.negative ? '−₹' : '₹'}
          </MandiText>
          <MandiText variant="hero" color={Colors.onGradient} style={styles.rupees}>
            {split.rupees}
          </MandiText>
          <MandiText variant="subtitle" color={Colors.onGradientMuted} style={styles.paise}>
            .{split.paise}
          </MandiText>
        </View>
      )}

      {meter != null && (
        <View style={styles.meter}>
          <View
            style={styles.track}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={`Added this month ${meter.added} of ${meter.limit} limit`}
            accessibilityValue={{ min: 0, max: 100, now: Math.round(meter.percent) }}
          >
            <View style={[styles.fill, { width: `${meter.percent}%` }]} />
          </View>
          <View style={styles.meterLabels}>
            <MandiText variant="caption" color={Colors.onGradientMuted}>
              Added this month {meter.added}
            </MandiText>
            <MandiText variant="caption" color={Colors.onGradientMuted}>
              Monthly limit {meter.limit}
            </MandiText>
          </View>
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    gap: Spacing.sm,
  },
  amountRow: { flexDirection: 'row', alignItems: 'baseline' },
  symbol: { marginRight: 2 },
  rupees: { ...TextStyles.hero, fontVariant: ['tabular-nums'] },
  paise: { marginLeft: 1 },
  meter: { gap: Spacing.xs, marginTop: Spacing.sm },
  track: {
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.onGradientSurface,
    overflow: 'hidden',
  },
  fill: { height: 4, borderRadius: Radius.full, backgroundColor: Colors.onGradient },
  meterLabels: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm },
});
