import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { MandiText } from '@/components/common';
import { MandiMap } from '@/components/delivery/MandiMap';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { OrderTrackingView, TrackerStage } from '@/lib/delivery/orderTracking';
import type { Delivery } from '@/models/delivery';
import { Colors, Elevation, IconSize, Radius, Spacing, TrackingLayout, hitSlopFor } from '@/theme';

const STAGE_ICON: Record<TrackerStage, keyof typeof Ionicons.glyphMap> = {
  bag: 'bag-handle',
  cube: 'cube',
  bicycle: 'bicycle',
  done: 'checkmark-circle',
};
const RING = 150;
const BUTTON = 36;

/**
 * The top of the tracking screen, and a smaller copy of it on an order's detail screen.
 *
 * <p>Until a partner has reported a position it is an illustration for the stage the order is at, on the brand
 * gradient (green with a check once delivered). From then on it is the live map. The map shows the partner only
 * where the server last put them: nothing here moves a marker between fixes, and a stale fix says so.
 */
export function TrackingTopArea({
  view, delivery, destination, height, insetTop = 0, overlap = TrackingLayout.sheetOverlap,
  compact = false, onBack, help, onPress,
}: {
  view: OrderTrackingView;
  delivery: Pick<Delivery, 'location' | 'locationStale' | 'locationAgeSeconds'> | null;
  destination: { latitude: number; longitude: number } | null;
  height: number;
  /** Safe-area top inset: the floating controls sit below it, and the band extends under it. */
  insetTop?: number;
  /** How far the sheet will ride up over the bottom edge; chips stay clear of it. */
  overlap?: number;
  compact?: boolean;
  onBack?: () => void;
  /** The Help pill, drawn by the caller because it opens a conversation. */
  help?: React.ReactNode;
  /** Makes the whole area a button (the map preview on a detail screen). */
  onPress?: () => void;
}) {
  const live = view.top === 'map' && view.showMap && delivery?.location != null;
  const waiting = view.top === 'map' && !live;
  const stale = live && delivery?.locationStale === true;

  const body = (
    <View style={[styles.area, { height }]}>
      {live && delivery?.location != null ? (
        <MandiMap
          driver={delivery.location}
          destination={destination}
          stale={delivery.locationStale}
          height={height}
          bare
        />
      ) : (
        <Band view={view} insetTop={insetTop} overlap={overlap} compact={compact} />
      )}
      {onBack != null && (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={hitSlopFor(BUTTON)}
          style={[styles.fab, { top: insetTop + Spacing.sm, left: Spacing.screenHorizontal }]}
        >
          <Ionicons name="arrow-back" size={IconSize.md} color={Colors.textPrimary} />
        </Pressable>
      )}
      {help != null && (
        <View style={[styles.help, { top: insetTop + Spacing.sm, right: Spacing.screenHorizontal }]}>{help}</View>
      )}
      {(stale || waiting) && (
        <View style={[styles.chip, { bottom: overlap + Spacing.lg + Spacing.sm }]}>
          <Ionicons name={stale ? 'time-outline' : 'locate-outline'} size={IconSize.sm} color={Colors.textSecondary} />
          <MandiText variant="captionEmphasis">
            {stale
              ? delivery?.locationAgeSeconds != null
                ? `Last update ${Math.max(1, Math.round(delivery.locationAgeSeconds / 60))} min ago`
                : 'Position may be out of date'
              : 'Waiting for the partner\'s location'}
          </MandiText>
        </View>
      )}
    </View>
  );

  if (onPress == null) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Track delivery on the map">
      {body}
    </Pressable>
  );
}

function Band({
  view, insetTop, overlap, compact,
}: { view: OrderTrackingView; insetTop: number; overlap: number; compact: boolean }) {
  const done = view.top === 'success';
  const colors = done
    ? ([Colors.successGradientStart, Colors.successGradientEnd] as const)
    : ([Colors.gradientStart, Colors.gradientEnd] as const);
  const pulse = view.searching || (view.segmentIndex === 0 && !view.complete);
  const size = compact ? IconSize.hero + IconSize.xl : TrackingLayout.illustrationIcon;
  return (
    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill}>
      <View style={[styles.centre, { paddingTop: insetTop, paddingBottom: compact ? 0 : overlap + Spacing.sm }]}>
        {pulse && <Rings />}
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Ionicons name={STAGE_ICON[view.stage]} size={size} color={Colors.onGradient} />
        </View>
      </View>
    </LinearGradient>
  );
}

/** Two rings that swell and fade, to say we are looking. Held still, and single, when the person asked for less motion. */
function Rings() {
  const reduceMotion = useReducedMotion();
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) {
      a.setValue(0);
      b.setValue(0);
      return undefined;
    }
    const loopA = Animated.loop(Animated.timing(a, { toValue: 1, duration: 1600, useNativeDriver: true }));
    const loopB = Animated.loop(Animated.sequence([
      Animated.delay(800),
      Animated.timing(b, { toValue: 1, duration: 1600, useNativeDriver: true }),
    ]));
    loopA.start();
    loopB.start();
    return () => {
      loopA.stop();
      loopB.stop();
    };
  }, [reduceMotion, a, b]);

  if (reduceMotion) return <View style={[styles.ring, styles.ringStill]} />;
  const style = (v: Animated.Value) => ({
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.6] }) }],
  });
  return (
    <>
      <Animated.View style={[styles.ring, style(a)]} />
      <Animated.View style={[styles.ring, style(b)]} />
    </>
  );
}

const styles = StyleSheet.create({
  area: { overflow: 'hidden', backgroundColor: Colors.mapBackground },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 3,
    borderColor: Colors.onGradientMuted,
  },
  ringStill: { opacity: 0.5, transform: [{ scale: 1.1 }] },
  fab: {
    position: 'absolute',
    width: BUTTON,
    height: BUTTON,
    borderRadius: BUTTON / 2,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...Elevation.raised,
  },
  help: { position: 'absolute' },
  chip: {
    position: 'absolute',
    left: Spacing.screenHorizontal,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs + 2,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md - 2,
    paddingVertical: Spacing.xs + 2,
    ...Elevation.raised,
  },
});
