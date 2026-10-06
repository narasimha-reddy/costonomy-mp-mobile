import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QrScanner } from '@/components/quickscan/QrScanner';
import { ScanHeader } from '@/components/quickscan/ScanHeader';
import { parseUpiQr } from '@/lib/upi/parseUpiQr';
import {
  MandiBottomSheet,
  MandiButton,
  MandiFormField,
  MandiText,
} from '@/components/common';
import { useOutlet } from '@/contexts/OutletProvider';
import { track } from '@/analytics';
import { WalletColors } from '@/theme';

const SCREEN = 'REST-QUICKSCAN-01';

/**
 * REST-QUICKSCAN-01. Scan a shop's UPI QR, or type its UPI ID by hand.
 *
 * <p>Two ways to the same place because a QR is not always available to point a
 * camera at — a sticker gone faded, a browser tab with no camera at all — and a
 * UPI ID typed or pasted is just as valid a payee. Both go through
 * {@link parseUpiQr}, so `pay.tsx` never has to know which one produced its
 * params.
 *
 * <p>The screen is the camera, full page. The typed UPI ID lives in a sheet behind
 * "Or enter a UPI ID", and a code that is not a UPI QR says so on the camera screen
 * itself so the next attempt is one more point of the camera.
 *
 * <p>Nothing here checks whether QuickScan is enabled or affordable: that is
 * `pay.tsx`'s config load, once there is a payee to check it against.
 */
export default function QuickScanIndexScreen() {
  const router = useRouter();
  const { outletId } = useOutlet();
  const [manual, setManual] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  function proceed(raw: string, source: 'scan' | 'manual') {
    const parsed = parseUpiQr(raw);
    const fail = source === 'scan' ? setScanError : setManualError;
    if (!parsed.ok) {
      fail(parsed.reason);
      return;
    }
    setScanError(null);
    setManualError(null);
    setManualOpen(false);
    track('quickscan_code_parsed', { screen: SCREEN, outletId });
    router.push({
      pathname: '/restaurant/quickscan/pay',
      params: {
        vpa: parsed.vpa,
        ...(parsed.name != null ? { name: parsed.name } : {}),
        ...(parsed.amount != null ? { amount: parsed.amount } : {}),
        ...(parsed.note != null ? { note: parsed.note } : {}),
      },
    });
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <QrScanner
        onScan={(text) => proceed(text, 'scan')}
        onManualEntry={() => setManualOpen(true)}
        notice={scanError}
      >
        <ScanHeader onBack={() => router.back()} onHelp={() => setHelpOpen(true)} />
      </QrScanner>

      <MandiBottomSheet
        visible={manualOpen}
        onClose={() => setManualOpen(false)}
        title="Enter UPI ID or paste a UPI link"
        closeLabel="Close the UPI ID entry"
      >
        <View style={styles.sheet}>
          <MandiFormField
            label="UPI ID"
            value={manual}
            onChangeText={(text) => { setManual(text); setManualError(null); }}
            placeholder="shopname@bank"
            autoCapitalize="none"
            keyboardType="email-address"
            error={manualError}
            testID="quickscan-upi-field"
          />
          <MandiButton
            label="Continue"
            size="lg"
            disabled={manual.trim() === ''}
            onPress={() => proceed(manual, 'manual')}
          />
        </View>
      </MandiBottomSheet>

      <MandiBottomSheet
        visible={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="Scanning a QR"
        closeLabel="Close the scanning help"
      >
        <View style={styles.sheet}>
          <MandiText>
            {"Point the camera at any UPI QR — a shop's sticker, a standee or another app — and hold it steady inside the frame."}
          </MandiText>
          <MandiText muted>
            {"No QR in front of you? Upload a photo of it, or enter the shop's UPI ID instead."}
          </MandiText>
        </View>
      </MandiBottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: WalletColors.ink },
  sheet: { gap: 12 },
});
