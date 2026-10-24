import React, { createContext, useContext } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { usePathname } from 'expo-router';
import { useOptionalSession } from '@/contexts/SessionProvider';
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

/** The supplier's desktop column: wider than a phone so a 1280 px screen is not 70% empty. */
export const SUPPLIER_WIDE_WIDTH = 560;
const WIDE_VIEWPORT = 900;

type Side = 'supplier' | 'restaurant';
/** The side the user was last on, for the screens both roles share (/chat, /notifications). */
let lastSide: Side | null = null;

/** Test seam. */
export function resetFrameSide(): void {
  lastSide = null;
}

/**
 * The column width for the current screen: the supplier's desktop width on a desktop-sized viewport, else the phone's.
 *
 * <p>Decided by the side the user is on, not by the path alone: /chat and /notifications are opened from the supplier
 * header too and must not snap back to 390. A supplier-only account is always on the supplier side; someone with both
 * roles keeps the side they came from.
 */
function useComputedFrameWidth(): number {
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const audience = useOptionalSession()?.audience;
  if (Platform.OS !== 'web') return DEVICE_WIDTH;

  let side: Side;
  if (pathname === '/supplier' || pathname?.startsWith('/supplier/')) side = 'supplier';
  else if (pathname === '/restaurant' || pathname?.startsWith('/restaurant/')) side = 'restaurant';
  else if (audience === 'SUPPLIER') side = 'supplier';
  else if (audience === 'RESTAURANT') side = 'restaurant';
  else side = lastSide ?? 'restaurant';
  lastSide = side;

  return width >= WIDE_VIEWPORT && side === 'supplier' ? SUPPLIER_WIDE_WIDTH : DEVICE_WIDTH;
}

const FrameWidthContext = createContext<number>(DEVICE_WIDTH);

/**
 * The width of the frame this component is in. `MandiBottomSheet` reads it so a sheet is never wider than its frame
 * (a `Modal` is portalled out of the frame's layout but keeps its React context). Outside a frame it is the phone width.
 */
export function useFrameWidth(): number {
  return useContext(FrameWidthContext);
}

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
  const frameWidth = useComputedFrameWidth();
  if (Platform.OS !== 'web') return <>{children}</>;

  return (
    <View style={styles.backdrop}>
      <View testID="device-frame" style={[styles.frame, { maxWidth: frameWidth }]}>
        <FrameWidthContext.Provider value={frameWidth}>{children}</FrameWidthContext.Provider>
      </View>
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
