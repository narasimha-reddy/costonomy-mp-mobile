import React, { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import jsQR from 'jsqr';
import { ScanSurface, type ScanAction } from '@/components/quickscan/ScanSurface';
import { UploadGlyph } from '@/components/quickscan/ScanGlyphs';
import { WalletColors, WalletType } from '@/theme';
import type { QrScannerProps } from './QrScanner';

/**
 * The full-page UPI QR scanner. Web build.
 *
 * <p>There is no camera stream worth relying on in a browser tab, so this reads
 * a QR from a photo instead: draw the chosen image to an off-screen canvas and
 * decode its pixels with `jsqr`, a pure-JS reader that needs no native module.
 * The same screen as the phone's, on a flat backdrop, with Upload QR as the way in
 * (there is no torch in a browser) and the "Or enter a UPI ID" link as the way out.
 */
export function QrScanner({ onScan, onManualEntry, notice, children }: QrScannerProps) {
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
        setError("Couldn't find a QR code in that photo. Try another, or enter the UPI ID.");
        return;
      }
      onScan(code.data);
    } catch {
      setError("Couldn't read that photo. Try another, or enter the UPI ID.");
    } finally {
      setBusy(false);
    }
  }

  const actions: ScanAction[] = [
    {
      key: 'upload',
      label: busy ? 'Reading…' : 'Upload QR',
      accessibilityLabel: 'Upload a photo of a QR code',
      glyph: <UploadGlyph />,
      onPress: pick,
      disabled: busy,
    },
  ];

  return (
    <ScanSurface
      background={<View style={styles.backdrop} />}
      actions={actions}
      error={error ?? notice ?? null}
      onManualEntry={onManualEntry}
      windowContent={(
        <Text style={styles.hint}>
          {"Scanning with a camera isn't available in the browser. Upload a photo of the shop's QR code."}
        </Text>
      )}
    >
      {children}
      {React.createElement('input', {
        ref: inputRef,
        type: 'file',
        accept: 'image/*',
        style: { display: 'none' },
        onChange: handleFile,
        'aria-label': 'Upload a photo of the QR code',
      })}
    </ScanSurface>
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
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: WalletColors.scanBackdrop },
  hint: { ...WalletType.scanChipLabel, lineHeight: 13, color: WalletColors.white, textAlign: 'center' },
});

export default QrScanner;
