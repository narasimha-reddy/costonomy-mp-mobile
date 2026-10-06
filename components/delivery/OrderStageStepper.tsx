import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiText } from '@/components/common';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { TrackerProblem, TrackerStep } from '@/lib/delivery/orderTracking';
import { Colors, Duration, Spacing, Tracker } from '@/theme';

export interface OrderStageStepperProps {
  steps: TrackerStep[];
  currentIndex: number;
  complete?: boolean;
  problem?: TrackerProblem;
  orientation?: 'horizontal' | 'vertical';
  /** Time to show beside each step in the vertical list, by step key. */
  stepTimes?: Partial<Record<string, string | null>>;
}

type StepState = 'done' | 'current' | 'upcoming';

const RAIL = 2;

/**
 * The order's progress as a row (or column) of steps.
 *
 * <p>It draws what it is given. It never decides a step is done: the index comes from the server's statuses, and a
 * tap on a step does nothing. State is never colour alone: done steps carry a check, a problem carries an icon, and
 * every step reads its state aloud.
 */
export function OrderStageStepper({
  steps, currentIndex, complete = false, problem = null, orientation = 'horizontal', stepTimes,
}: OrderStageStepperProps) {
  if (steps.length === 0 || currentIndex < 0) return null;
  const current = Math.min(currentIndex, steps.length - 1);
  const currentStep = steps[current];
  const stateOf = (i: number): StepState => (complete || i < current ? 'done' : i === current ? 'current' : 'upcoming');
  const vertical = orientation === 'vertical';

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${current + 1} of ${steps.length}: ${currentStep?.longLabel ?? ''}`}
      accessibilityValue={{ min: 1, max: steps.length, now: current + 1 }}
      style={vertical ? styles.column : styles.row}
    >
      {steps.map((step, i) => {
        const state = stateOf(i);
        const time = stepTimes?.[step.key] ?? null;
        const label = `${step.longLabel}, ${state === 'done' ? 'done' : state === 'current' ? 'current' : 'upcoming'}`;
        const railDone = i < current || complete;
        if (vertical) {
          return (
            <View key={step.key} style={styles.vStep} accessible accessibilityLabel={label} testID={`step-${step.key}`}>
              <View style={styles.vGutter}>
                <StepDot state={state} problem={problem} />
                {i < steps.length - 1 && <View style={[styles.vRail, railDone && styles.railDone]} />}
              </View>
              <View style={styles.vBody}>
                <MandiText
                  variant={state === 'current' ? 'bodyEmphasis' : 'body'}
                  color={state === 'upcoming' ? Colors.textTertiary : Colors.textPrimary}
                >
                  {step.longLabel}
                </MandiText>
                {time != null && <MandiText variant="caption" color={Colors.textSecondary}>{time}</MandiText>}
              </View>
            </View>
          );
        }
        return (
          <View key={step.key} style={styles.hStep} accessible accessibilityLabel={label} testID={`step-${step.key}`}>
            <View style={styles.hTop}>
              <View style={[styles.hRail, i > 0 && (i <= current || complete) && styles.railDone, i === 0 && styles.hidden]} />
              <StepDot state={state} problem={problem} />
              <View style={[styles.hRail, railDone && styles.railDone, i === steps.length - 1 && styles.hidden]} />
            </View>
            <MandiText
              variant={state === 'current' ? 'captionEmphasis' : 'caption'}
              color={state === 'upcoming' ? Colors.textTertiary : Colors.textPrimary}
              center
              numberOfLines={2}
            >
              {step.label}
            </MandiText>
          </View>
        );
      })}
    </View>
  );
}

function StepDot({ state, problem }: { state: StepState; problem: TrackerProblem }) {
  const reduceMotion = useReducedMotion();
  const pulse = useRef(new Animated.Value(0)).current;
  const pulsing = state === 'current' && !reduceMotion;

  useEffect(() => {
    if (!pulsing) {
      pulse.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: Duration.pulse / 2, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: Duration.pulse / 2, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulsing, pulse]);

  if (state === 'current') {
    const colour = problem != null ? Colors.trackerProblem : Colors.trackerStepCurrent;
    return (
      <View style={styles.slot}>
        <Animated.View
          testID="step-halo"
          style={[
            styles.halo,
            pulsing && {
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
            },
          ]}
        />
        <View style={[styles.dot, styles.dotCurrent, { backgroundColor: colour }]}>
          {problem != null && (
            <Ionicons
              name={problem === 'danger' ? 'close' : 'alert'}
              size={Tracker.dotCurrent - 4}
              color={Colors.textInverse}
            />
          )}
        </View>
      </View>
    );
  }
  if (state === 'done') {
    return (
      <View style={styles.slot}>
        <View style={[styles.dot, { backgroundColor: Colors.trackerStepDone }]}>
          <Ionicons name="checkmark" size={Tracker.dot - 2} color={Colors.textInverse} />
        </View>
      </View>
    );
  }
  return (
    <View style={styles.slot}>
      <View style={[styles.dot, { backgroundColor: Colors.trackerStepTodo }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  column: { flexDirection: 'column' },
  slot: { width: Tracker.halo, height: Tracker.halo, alignItems: 'center', justifyContent: 'center' },
  halo: {
    position: 'absolute',
    width: Tracker.halo,
    height: Tracker.halo,
    borderRadius: Tracker.halo / 2,
    backgroundColor: Colors.trackerHalo,
  },
  dot: { width: Tracker.dot, height: Tracker.dot, borderRadius: Tracker.dot / 2, alignItems: 'center', justifyContent: 'center' },
  dotCurrent: { width: Tracker.dotCurrent, height: Tracker.dotCurrent, borderRadius: Tracker.dotCurrent / 2 },
  railDone: { backgroundColor: Colors.trackerRailDone },
  hidden: { opacity: 0 },
  hStep: { flex: 1, alignItems: 'center', gap: Spacing.xs },
  hTop: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  hRail: { flex: 1, height: RAIL, backgroundColor: Colors.trackerRail },
  vStep: { flexDirection: 'row', gap: Spacing.md },
  vGutter: { alignItems: 'center', width: Tracker.halo },
  vRail: { flex: 1, width: RAIL, minHeight: Spacing.lg, backgroundColor: Colors.trackerRail },
  vBody: { flex: 1, paddingTop: Spacing.xs, paddingBottom: Spacing.md, gap: 2 },
});
