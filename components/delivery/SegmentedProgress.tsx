import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { MandiText } from '@/components/common';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { Colors, Radius, Spacing, TrackingLayout } from '@/theme';

/**
 * The order's progress as five thin segments and one line of words.
 *
 * <p>It draws what it is given: the index comes from the server's statuses and a tap does nothing. Reached segments
 * are green, the current one is part filled, and while a partner is being found it carries a shimmer so the screen
 * reads as alive (held still when the person asked for reduced motion).
 */
export function SegmentedProgress({
  segments, index, fill, shimmer = false, warning = false, complete = false, stepLine, nextLine,
}: {
  segments: string[];
  index: number;
  /** How full the current segment is, 0 to 1. */
  fill: number;
  shimmer?: boolean;
  warning?: boolean;
  complete?: boolean;
  stepLine: string | null;
  nextLine: string | null;
}) {
  if (segments.length === 0 || index < 0) return null;
  return (
    <View>
      <View
        style={styles.row}
        accessibilityRole="progressbar"
        accessibilityLabel={`Step ${index + 1} of ${segments.length}: ${segments[index] ?? ''}`}
        accessibilityValue={{ min: 1, max: segments.length, now: index + 1 }}
      >
        {segments.map((label, i) => {
          if (complete || i < index) return <View key={label} style={[styles.segment, styles.done]} testID={`segment-${i}`} />;
          if (i === index) {
            return (
              <View key={label} style={styles.segment} testID={`segment-${i}`}>
                <CurrentFill fill={fill} shimmer={shimmer} warning={warning} />
              </View>
            );
          }
          return <View key={label} style={styles.segment} testID={`segment-${i}`} />;
        })}
      </View>
      {(stepLine != null || nextLine != null) && (
        <View style={styles.text}>
          <MandiText variant="caption" color={Colors.textSecondary} style={styles.flex}>{stepLine ?? ''}</MandiText>
          {nextLine != null && <MandiText variant="caption" color={Colors.textSecondary}>{nextLine}</MandiText>}
        </View>
      )}
    </View>
  );
}

function CurrentFill({ fill, shimmer, warning }: { fill: number; shimmer: boolean; warning: boolean }) {
  const reduceMotion = useReducedMotion();
  const sweep = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(0);
  const moving = shimmer && !reduceMotion;

  useEffect(() => {
    if (!moving) {
      sweep.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: 1200, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [moving, sweep]);

  const colour = warning ? Colors.warning : Colors.primary;
  const pct = `${Math.round(Math.min(1, Math.max(0, shimmer ? 1 : fill)) * 100)}%` as `${number}%`;
  return (
    <View style={styles.fillClip} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={[styles.fill, { width: pct, backgroundColor: colour }]} />
      {moving && width > 0 && (
        <Animated.View
          testID="segment-shimmer"
          style={[
            styles.glint,
            { width: width * 0.4, transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-width * 0.4, width] }) }] },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.xs },
  segment: {
    flex: 1,
    height: TrackingLayout.segmentHeight,
    borderRadius: Radius.sm / 2,
    backgroundColor: Colors.progressTrack,
    overflow: 'hidden',
  },
  done: { backgroundColor: Colors.success },
  fillClip: { flex: 1, overflow: 'hidden' },
  fill: { height: '100%' },
  glint: { position: 'absolute', top: 0, bottom: 0, backgroundColor: Colors.primaryLight, opacity: 0.7 },
  text: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm, marginTop: Spacing.sm - 1 },
  flex: { flex: 1 },
});
