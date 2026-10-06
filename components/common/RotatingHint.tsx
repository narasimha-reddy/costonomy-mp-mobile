import React, { useEffect, useRef, useState } from 'react';
import { Animated, AppState, StyleSheet, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import { Colors, Spacing, TextStyles } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { HINT_INTERVAL_MS, HINT_TRANSITION_MS } from '@/lib/search/hints';

/** How far a hint travels while it slides (a spacing token, not a literal). */
const SLIDE = Spacing.sm;

interface RotatingHintProps {
  hints: readonly string[];
  testID?: string;
}

interface Shown {
  cur: number;
  prev: number | null;
}

/**
 * One hint at a time, replaced every `HINT_INTERVAL_MS` with a slide-and-fade.
 *
 * Runs only while mounted, the screen is focused and the app is in the
 * foreground. Reduced motion swaps the text instantly. Hidden from screen
 * readers and not a live region: the bar's own label is the accessible name,
 * so nothing is announced every few seconds. Never intercepts touches.
 */
export function RotatingHint({ hints, testID }: RotatingHintProps) {
  const focused = useIsFocused();
  const reduced = useReducedMotion();
  const [appActive, setAppActive] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const [shown, setShown] = useState<Shown>({ cur: 0, prev: null });
  const progress = useRef(new Animated.Value(1)).current;
  const count = hints.length;

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAppActive(s === 'active'));
    return () => sub.remove();
  }, []);

  const running = focused && appActive && count > 1;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setShown((s) => ({ cur: (s.cur + 1) % count, prev: s.cur }));
    }, HINT_INTERVAL_MS);
    return () => clearInterval(id);
  }, [running, count]);

  // Animate each advance; any pause settles the transition so resuming never jumps.
  useEffect(() => {
    if (reduced || shown.prev === null) return;
    progress.setValue(0);
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: HINT_TRANSITION_MS,
      useNativeDriver: true,
    });
    anim.start(({ finished }) => {
      if (finished) setShown((s) => (s.prev === null ? s : { ...s, prev: null }));
    });
    return () => {
      anim.stop();
      progress.setValue(1);
    };
  }, [shown, reduced, progress]);

  const incoming = {
    opacity: progress,
    transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [SLIDE, 0] }) }],
  };
  const outgoing = {
    opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -SLIDE] }) }],
  };
  const animating = !reduced && shown.prev !== null;

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.clip}
    >
      {animating && (
        <Animated.Text numberOfLines={1} style={[styles.text, outgoing]}>
          {hints[shown.prev as number]}
        </Animated.Text>
      )}
      <Animated.Text
        testID={testID}
        numberOfLines={1}
        style={[styles.text, animating && incoming]}
      >
        {hints[shown.cur]}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    height: TextStyles.body.lineHeight,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  text: {
    position: 'absolute',
    left: 0,
    right: 0,
    ...TextStyles.body,
    color: Colors.textTertiary,
  },
});
