import React, { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import jsQR from 'jsqr';
import { Ionicons } from '@expo/vector-icons';
import { MandiButton, MandiText } from '@/components/common';
import { Colors, IconSize, Radius, Spacing } from '@/theme';
import type { QrScannerProps } from './QrScanner';

/**
 * A UPI QR scanner. Web build.
 *
 * <p>There is no camera stream worth relying on in a browser tab, so this reads
 * a QR from a photo instead: draw the chosen image to an off-screen canvas and
 * decode its pixels with `jsqr`, a pure-JS reader that needs no native module.
 * The manual-entry field on REST-QUICKSCAN-01 is what a restaurant falls back to
 * when they have no photo, same as the native build's denied-permission path.
 */
export function QrScanner({ onScan }: QrScannerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pick() {
    setError(null);
    inputRef.current?.click();
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    // Allow choosing the same file again after a failed read.
    event.target.value = '';
    if (file == null) return;

    setBusy(true);
    setError(null);
    try {
      const image = await loadImage(file);
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      if (context == null) throw new Error('canvas unsupported');
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(pixels.data, pixels.width, pixels.height);
      if (code == null || code.data === '') {
        setError("Couldn't find a QR code in that photo. Try another, or enter the UPI ID below.");
        return;
      }
      onScan(code.data);
    } catch {
      setError("Couldn't read that photo. Try another, or enter the UPI ID below.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.frame}>
      <Ionicons name="qr-code-outline" size={IconSize.hero} color={Colors.textTertiary} />
      <MandiText variant="bodyEmphasis" center>Upload a photo of the QR</MandiText>
      <MandiText variant="caption" color={Colors.textSecondary} center>
        {"Scanning with a camera isn't available in the browser. Choose a photo of the shop's "
          + 'QR code instead.'}
      </MandiText>
      <MandiButton
        label={busy ? 'Reading…' : 'Choose Photo'}
        size="md"
        fullWidth={false}
        loading={busy}
        onPress={pick}
      />
      {error != null && (
        <MandiText variant="caption" color={Colors.danger} center accessibilityLiveRegion="polite">
          {error}
        </MandiText>
      )}
      {React.createElement('input', {
        ref: inputRef,
        type: 'file',
        accept: 'image/*',
        style: { display: 'none' },
        onChange: handleFile,
        'aria-label': 'Upload a photo of the QR code',
      })}
    </View>
  );
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not load that image.'));
    };
    image.src = url;
  });
}

const styles = StyleSheet.create({
  frame: {
    minHeight: 220,
    gap: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xl,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceSunken,
  },
});

export default QrScanner;
