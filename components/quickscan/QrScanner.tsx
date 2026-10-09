import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CameraView, scanFromURLAsync, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { MandiButton } from '@/components/common';
import { ScanSurface, type ScanAction } from '@/components/quickscan/ScanSurface';
import { TorchGlyph, UploadGlyph } from '@/components/quickscan/ScanGlyphs';
import { WalletColors, WalletType } from '@/theme';

export interface QrScannerProps {
  /** Called with the raw payload of a scanned QR code, once per code held to the camera. */
  onScan: (text: string) => void;
  /** The "Or enter a UPI ID" link. */
  onManualEntry: () => void;
  /** A message from the caller to show on the screen, e.g. that the code scanned is not a UPI QR. */
  notice?: string | null;
  /** The header, drawn over the camera. */
  children?: React.ReactNode;
}

const RE_ARM_MS = 2000;

/**
 * The full-page UPI QR scanner. Native build.
 *
 * <p>Permission is requested at the moment this mounts — QuickScan's own screen
 * already told the restaurant what it's for by getting here, so there is no
 * earlier, better place to ask. Denied or unavailable falls back to a flat
 * backdrop with the same layout and says so plainly inside the window; the
 * "Or enter a UPI ID" link and Upload QR keep the screen usable either way.
 *
 * <p><b>One call per code.</b> `onBarcodeScanned` keeps firing for as long as a
 * code sits in frame, and forwarding every one of those would mean navigating
 * away and back into a scanner that immediately re-fires on the same code. A
 * short re-arm delay, rather than a permanent latch, is what lets a restaurant
 * that scanned the wrong sticker just point the camera at the right one.
 *
 * <p>Upload QR reads a QR from a photo from the gallery through the same path
 * as a live scan; the torch is the camera's own.
 */
export function QrScanner({ onScan, onManualEntry, notice, children }: QrScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const armed = useRef(true);

  useEffect(() => {
    if (permission == null) void requestPermission();
    // Ask once, on mount — not on every permission-object change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleScanned(data: string) {
    if (!armed.current) return;
    armed.current = false;
    setError(null);
    onScan(data);
    setTimeout(() => { armed.current = true; }, RE_ARM_MS);
  }

  async function uploadPhoto() {
    setError(null);
    setReading(true);
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        quality: 1,
      });
      const uri = picked.canceled ? null : picked.assets?.[0]?.uri;
      if (uri == null) return;
      const found = await scanFromURLAsync(uri, ['qr']);
      const data = found[0]?.data;
      if (data == null || data === '') {
        setError("Couldn't find a QR code in that photo. Try another, or enter the UPI ID.");
        return;
      }
      handleScanned(data);
    } catch {
      setError("Couldn't read that photo. Try another, or enter the UPI ID.");
    } finally {
      setReading(false);
    }
  }

  const granted = permission?.granted === true;
  const actions: ScanAction[] = [
    {
      key: 'upload',
      label: 'Upload QR',
      accessibilityLabel: 'Upload a photo of a QR code',
      glyph: <UploadGlyph />,
      onPress: () => { void uploadPhoto(); },
      disabled: reading,
    },
    {
      key: 'torch',
      label: 'Torch',
      accessibilityLabel: torch ? 'Torch, on. Turn the torch off' : 'Torch, off. Turn the torch on',
      glyph: <TorchGlyph />,
      onPress: () => setTorch((on) => !on),
      active: torch,
      disabled: !granted,
    },
  ];

  const permissionPrompt = granted ? null : (
    <View style={styles.prompt} testID="camera-permission-prompt">
      <Text style={styles.promptText}>
        {permission?.canAskAgain === false
          ? "Camera access is off. Turn it on in your phone's settings, or enter the UPI ID."
          : 'Mandi needs your camera to scan a QR code.'}
      </Text>
      {permission?.canAskAgain !== false && (
        <MandiButton
          label="Allow camera"
          size="md"
          fullWidth={false}
          onPress={() => { void requestPermission(); }}
        />
      )}
    </View>
  );

  return (
    <ScanSurface
      background={granted ? (
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          enableTorch={torch}
          accessibilityLabel="QR code scanner"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={(result) => handleScanned(result.data)}
        />
      ) : <View style={styles.backdrop} />}
      actions={actions}
      error={error ?? notice ?? null}
      onManualEntry={onManualEntry}
      windowContent={permissionPrompt}
    >
      {children}
    </ScanSurface>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: WalletColors.scanBackdrop },
  prompt: { alignItems: 'center', gap: 12 },
  promptText: { ...WalletType.scanChipLabel, lineHeight: 13, color: WalletColors.white, textAlign: 'center' },
});

export default QrScanner;
