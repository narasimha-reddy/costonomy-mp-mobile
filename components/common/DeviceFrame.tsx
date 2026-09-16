import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Colors } from '@/theme';

/**
 * The phone column's width, in points.
 *
 * <p>Exported because a `Modal` does not render inside this frame: on web
 * `react-native-web` portals it to the document body, so a bottom sheet laid out
 * as "full width" is the width of the *browser*. `MandiBottomSheet` caps itself
 * at this instead, which is the same number rather than a second one that drifts.
 */
export const DEVICE_WIDTH = 390;

/**
 * Constrains the app to a phone-sized column on web.
 *
 * <p>This app is a phone app. `react-native-web` will happily stretch a screen
 * to a 2560px browser window, and a layout checked at that width has not been
 * checked — a row that wraps comfortably across a desktop viewport is unreadable
 * on the 390pt screen it was designed for, and the reverse mistake is worse.
 *
 * <p>So the web build renders inside a fixed-width frame on a neutral backdrop.
 * `DEVICE_WIDTH` is a 6.1" phone in points, which is the narrowest common device
 * this has to look right on.
 *
 * <p>On iOS and Android this is a pass-through: the device is already the frame.
 */
export function DeviceFrame({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== 'web') return <>{children}</>;

  return (
    <View style={styles.backdrop}>
      <View style={styles.frame}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: Colors.backdrop,
  },
  frame: {
    flex: 1,
    width: '100%',
    maxWidth: DEVICE_WIDTH,
    backgroundColor: Colors.background,
    overflow: 'hidden',
    // A hairline rather than a device bezel: this is a viewport guide, not a
    // mockup, and a chrome-heavy frame invites judging the design inside it.
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
});
