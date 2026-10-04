import React, { useEffect, useState } from 'react';
import { Image, StyleSheet } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

export const MAX_SCALE = 4;
export const MIN_SCALE = 1;
const DOUBLE_TAP_SCALE = 2.5;

/**
 * One bill page that can be pinched, dragged while zoomed in, and double-tapped to zoom in and out.
 *
 * <p>While it is not zoomed the drag is switched off, so a swipe goes to the page pager around it.
 *
 * <p>Optionally controlled: `zoom` (1 to 4) and `rotation` (degrees) set from buttons outside, and
 * `onZoomChange` reports a pinch or double-tap so those buttons can show the zoom in use.
 */
export function ZoomableImage({
  uri, width, height, label, onError, zoom, rotation = 0, onZoomChange,
}: {
  uri: string;
  width: number;
  height: number;
  label: string;
  onError: () => void;
  zoom?: number;
  rotation?: number;
  onZoomChange?: (zoom: number) => void;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const turn = useSharedValue(rotation);
  const [zoomed, setZoomed] = useState(false);
  const report = (value: number) => onZoomChange?.(Math.round(value * 100) / 100);

  // A zoom set from outside: animate to it; back at 1 the page is re-centred.
  useEffect(() => {
    if (zoom == null) return;
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, zoom));
    scale.value = withTiming(next);
    savedScale.value = next;
    if (next <= 1.02) {
      x.value = withTiming(0);
      y.value = withTiming(0);
      savedX.value = 0;
      savedY.value = 0;
    }
    setZoomed(next > 1.02);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  useEffect(() => {
    turn.value = withTiming(rotation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotation]);

  const reset = () => {
    'worklet';
    scale.value = withTiming(1);
    savedScale.value = 1;
    x.value = withTiming(0);
    y.value = withTiming(0);
    savedX.value = 0;
    savedY.value = 0;
    runOnJS(setZoomed)(false);
    runOnJS(report)(1);
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(MAX_SCALE, Math.max(0.8, savedScale.value * e.scale));
    })
    .onEnd(() => {
      if (scale.value <= 1.02) {
        reset();
      } else {
        savedScale.value = scale.value;
        runOnJS(setZoomed)(true);
        runOnJS(report)(scale.value);
      }
    });

  const pan = Gesture.Pan()
    .enabled(zoomed)
    .onUpdate((e) => {
      const maxX = ((scale.value - 1) * width) / 2;
      const maxY = ((scale.value - 1) * height) / 2;
      x.value = Math.max(-maxX, Math.min(maxX, savedX.value + e.translationX));
      y.value = Math.max(-maxY, Math.min(maxY, savedY.value + e.translationY));
    })
    .onEnd(() => {
      savedX.value = x.value;
      savedY.value = y.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1.02) {
        reset();
      } else {
        scale.value = withTiming(DOUBLE_TAP_SCALE);
        savedScale.value = DOUBLE_TAP_SCALE;
        runOnJS(setZoomed)(true);
        runOnJS(report)(DOUBLE_TAP_SCALE);
      }
    });

  const gesture = Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan));

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value }, { translateY: y.value }, { scale: scale.value }, { rotate: `${turn.value}deg` },
    ],
  }));

  return (
    <GestureHandlerRootView style={{ width, height }}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.frame, { width, height }, style]}>
          <Image
            source={{ uri }}
            style={{ width, height }}
            resizeMode="contain"
            onError={onError}
            accessibilityLabel={label}
            accessibilityIgnoresInvertColors
            testID="bill-page-image"
          />
        </Animated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ frame: { overflow: 'hidden' } });
