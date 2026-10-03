import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { BillLayout, WalletColors } from '@/theme';

/** Three dots that fade in turn: "working on it" without a spinner. Still when Reduce Motion is on. */
export function ReadingDots({ color = WalletColors.orange }: { color?: string }) {
  const reduced = useReducedMotion();
  const phase = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) return undefined;
    const loop = Animated.loop(
      Animated.timing(phase, { toValue: 3, duration: 1200, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, phase]);

  return (
    <View style={styles.row} testID="reading-dots" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[0, 1, 2].map((i) => {
        const opacity = reduced
          ? 0.6
          : phase.interpolate({
            inputRange: [i - 1, i, i + 1, i + 2],
            outputRange: [0.25, 1, 0.25, 0.25],
            extrapolate: 'clamp',
          });
        return <Animated.View key={i} style={[styles.dot, { backgroundColor: color, opacity }]} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: BillLayout.dot, height: BillLayout.dot, borderRadius: BillLayout.dot / 2 },
});
