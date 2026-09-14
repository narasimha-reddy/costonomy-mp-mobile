import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';
import { Colors, Radius, Spacing } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface MandiSkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}

/**
 * A shimmering placeholder block. PRD §23A.46: structured content gets skeletons,
 * spinners are reserved for small indeterminate actions.
 *
 * The shimmer stops entirely under "Reduce Motion" — a looping animation is
 * precisely what that setting exists to suppress.
 */
export function MandiSkeleton({
  width = '100%',
  height = 16,
  radius = Radius.sm,
  style,
}: MandiSkeletonProps) {
  const reducedMotion = useReducedMotion();
  // A useState initialiser, not useRef(...).current: reading `.current` during
  // render is what React 19 flags, and this gives the same construct-once
  // semantics without it.
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reducedMotion) return;

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reducedMotion]);

  return (
    <Animated.View
      // Skeletons are noise to a screen reader; the loading state is announced
      // once by the container via MandiLoadingAnnouncement instead.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width, height, borderRadius: radius, backgroundColor: Colors.skeletonBase },
        !reducedMotion && {
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.45] }),
        },
        style,
      ]}
    />
  );
}

/** A skeleton shaped like a card in a vertical feed. */
export function MandiSkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <View style={styles.card}>
      <MandiSkeleton width="60%" height={18} />
      {Array.from({ length: lines }).map((_, i) => (
        <MandiSkeleton key={i} width={i === lines - 1 ? '40%' : '100%'} height={12} />
      ))}
    </View>
  );
}

/** A skeleton feed. Use as the `loading` branch of a list screen. */
export function MandiSkeletonList({ count = 4, lines = 3 }: { count?: number; lines?: number }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }).map((_, i) => (
        <MandiSkeletonCard key={i} lines={lines} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.cardPadding,
    gap: Spacing.sm,
  },
  list: {
    gap: Spacing.listGap,
    paddingHorizontal: Spacing.screenHorizontal,
    paddingVertical: Spacing.screenVertical,
  },
});

export default MandiSkeleton;
