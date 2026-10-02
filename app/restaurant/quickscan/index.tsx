import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { QrScanner } from '@/components/quickscan/QrScanner';
import { parseUpiQr } from '@/lib/upi/parseUpiQr';
import {
  MandiButton,
  MandiCard,
  MandiFormField,
  MandiHeader,
  MandiScreen,
  MandiText,
} from '@/components/common';
import { useOutlet } from '@/contexts/OutletProvider';
import { track } from '@/analytics';

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
 * <p>Nothing here checks whether QuickScan is enabled or affordable: that is
 * `pay.tsx`'s config load, once there is a payee to check it against.
 */
export default function QuickScanIndexScreen() {
  const router = useRouter();
  const { outletId } = useOutlet();
  const [manual, setManual] = useState('');
  const [error, setError] = useState<string | null>(null);

  function proceed(raw: string) {
    const parsed = parseUpiQr(raw);
    if (!parsed.ok) {
      setError(parsed.reason);
      return;
    }
    setError(null);
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
    <MandiScreen header={<MandiHeader title="QuickScan" subtitle="Pay a shop by scanning its QR" back />}>
      <QrScanner onScan={proceed} />

      <MandiCard>
        <MandiText variant="bodyEmphasis">Enter UPI ID or paste a UPI link</MandiText>
        <MandiFormField
          label="UPI ID"
          value={manual}
          onChangeText={(text) => { setManual(text); setError(null); }}
          placeholder="shopname@bank"
          autoCapitalize="none"
          keyboardType="email-address"
          error={error}
        />
        <MandiButton
          label="Continue"
          size="lg"
          disabled={manual.trim() === ''}
          onPress={() => proceed(manual)}
        />
      </MandiCard>
    </MandiScreen>
  );
}
