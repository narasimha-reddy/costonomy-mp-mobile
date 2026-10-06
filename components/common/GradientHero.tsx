import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MandiText } from '@/components/common/MandiText';
import { Colors, Radius, Spacing, TextStyles } from '@/theme';

export interface GradientHeroSplit {
  negative: boolean;
  rupees: string;
  paise: string;
}

export interface GradientHeroMeter {
  /** 0 to 100, the width of the fill. */
  percent: number;
  leftLabel: string;
  rightLabel: string;
  /** Read by a screen reader for the bar; unused when the whole hero has one label. */
  accessibilityLabel: string;
}

/**
 * The orange hero card the Wallet and Credit screens share: a small caption, the
 * figure (small ₹, large rupees, smaller paise), optional content under it, and a
 * thin meter with a label at each end.
 *
 * <p>Presentational only. The caller decides what the figure and the meter mean.
 * With `accessibilityLabel` the whole card is one spoken element; without it the
 * figure and the bar speak for themselves.
 */
export function GradientHero({
  label, split, amountAccessibilityLabel, meter, children, accessibilityLabel, testID,
}: {
  label: string;
  /** Null shows a dash rather than ₹NaN. */
  split: GradientHeroSplit | null;
  amountAccessibilityLabel?: string;
  meter?: GradientHeroMeter | null;
  /** Shown between the figure and the meter. */
  children?: React.ReactNode;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const whole = accessibilityLabel != null;

  return (
    <LinearGradient
      colors={[Colors.gradientStart, Colors.gradientEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.hero}
      testID={testID}
      accessible={whole ? true : undefined}
      accessibilityLabel={accessibilityLabel}
    >
      <MandiText variant="caption" color={Colors.onGradientMuted}>{label}</MandiText>

      {split == null ? (
        <MandiText variant="display" color={Colors.onGradient}>—</MandiText>
      ) : (
        <View
          style={styles.amountRow}
          accessible={!whole}
          accessibilityLabel={whole ? undefined : amountAccessibilityLabel}
        >
          <MandiText variant="subtitle" color={Colors.onGradient} style={styles.symbol}>
            {split.negative ? '−₹' : '₹'}
          </MandiText>
          <MandiText variant="hero" color={Colors.onGradient} style={styles.rupees} numberOfLines={1} adjustsFontSizeToFit>
            {split.rupees}
          </MandiText>
          <MandiText variant="subtitle" color={Colors.onGradientMuted} style={styles.paise}>
            .{split.paise}
          </MandiText>
        </View>
      )}

      {children}

      {meter != null && (
        <View style={styles.meter}>
          <View
            style={styles.track}
            testID={testID ? `${testID}-meter` : undefined}
            accessible={!whole}
            accessibilityRole={whole ? undefined : 'progressbar'}
            accessibilityLabel={whole ? undefined : meter.accessibilityLabel}
            accessibilityValue={whole ? undefined : { min: 0, max: 100, now: Math.round(meter.percent) }}
          >
            <View style={[styles.fill, { width: `${meter.percent}%` }]} />
          </View>
          <View style={styles.meterLabels}>
            <MandiText variant="caption" color={Colors.onGradientMuted}>{meter.leftLabel}</MandiText>
            <MandiText variant="caption" color={Colors.onGradientMuted}>{meter.rightLabel}</MandiText>
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
  amountRow: { flexDirection: 'row', alignItems: 'baseline', flexShrink: 1 },
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
