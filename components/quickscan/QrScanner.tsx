import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { MandiButton, MandiText } from '@/components/common';
import { Colors, IconSize, Radius, Spacing } from '@/theme';

export interface QrScannerProps {
  /** Called with the raw payload of a scanned QR code, once per code held to the camera. */
  onScan: (text: string) => void;
}

const RE_ARM_MS = 2000;

/**
 * A UPI QR scanner. Native build.
 *
 * <p>Permission is requested at the moment this mounts — QuickScan's own screen
 * already told the restaurant what it's for by getting here, so there is no
 * earlier, better place to ask. Denied or unavailable falls back to naming that
 * plainly; the manual-entry field below this component on REST-QUICKSCAN-01 is
 * what keeps the screen usable either way, so this never needs to insist.
 *
 * <p><b>One call per code.</b> `onBarcodeScanned` keeps firing for as long as a
 * code sits in frame, and forwarding every one of those would mean navigating
 * away and back into a scanner that immediately re-fires on the same code. A
 * short re-arm delay, rather than a permanent latch, is what lets a restaurant
 * that scanned the wrong sticker just point the camera at the right one.
 */
export function QrScanner({ onScan }: QrScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const armed = useRef(true);

  useEffect(() => {
    if (permission == null) void requestPermission();
    // Ask once, on mount — not on every permission-object change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleScanned(data: string) {
    if (!armed.current) return;
    armed.current = false;
    onScan(data);
    setTimeout(() => { armed.current = true; }, RE_ARM_MS);
  }

  if (permission == null || !permission.granted) {
    return (
      <View style={styles.fallback}>
        <Ionicons name="camera-outline" size={IconSize.hero} color={Colors.textTertiary} />
        <MandiText variant="bodyEmphasis" center>
          {permission?.canAskAgain === false
            ? "Camera access is off. Turn it on in your phone's settings, or enter the UPI ID below."
            : 'Mandi needs your camera to scan a QR code.'}
        </MandiText>
        {permission?.canAskAgain !== false && (
          <MandiButton
            label="Allow Camera"
            size="md"
            fullWidth={false}
            onPress={() => { void requestPermission(); }}
          />
        )}
      </View>
    );
  }

  return (
    <View style={styles.frame} accessibilityLabel="QR code scanner" accessible>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={(result: { data: string }) => handleScanned(result.data)}
      />
      <View style={styles.reticle} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    height: 260,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceSunken,
  },
  reticle: {
    position: 'absolute',
    top: '18%',
    left: '18%',
    right: '18%',
    bottom: '18%',
    borderWidth: 2,
    borderColor: Colors.onGradient,
    borderRadius: Radius.md,
  },
  fallback: {
    height: 260,
    gap: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceSunken,
  },
});

export default QrScanner;
