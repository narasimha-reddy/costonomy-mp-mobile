import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { MandiText } from '@/components/common';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { Colors, Radius, Spacing } from '@/theme';

/**
 * Progress while a delivery partner is being found. With a `fraction` it is a determinate bar over the automatic
 * search window; without one it is an indeterminate sweep (still, when the person asked for reduced motion).
 */
export function SearchProgressBar({
  fraction,
  label,
}: {
  fraction: number | null;
  label: string;
}) {
  const reduceMotion = useReducedMotion();
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (fraction != null || reduceMotion) return undefined;
    const loop = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: 1400, useNativeDriver: false }));
    loop.start();
    return () => loop.stop();
  }, [fraction, reduceMotion, sweep]);

  const width = fraction != null ? `${Math.round(fraction * 100)}%` : '35%';
  const left = fraction != null || reduceMotion
    ? undefined
    : sweep.interpolate({ inputRange: [0, 1], outputRange: ['-35%', '100%'] });

  return (
    <View style={styles.wrap}>
      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        accessibilityValue={fraction != null ? { min: 0, max: 100, now: Math.round(fraction * 100) } : undefined}
      >
        <Animated.View style={[styles.fill, { width: width as `${number}%` }, left != null && { left }]} />
      </View>
      <MandiText variant="caption" color={Colors.textSecondary}>{label}</MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.xs, marginVertical: Spacing.sm },
  track: {
    height: 8,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceSunken,
    overflow: 'hidden',
  },
  fill: { height: 8, borderRadius: Radius.md, backgroundColor: Colors.primary },
});
