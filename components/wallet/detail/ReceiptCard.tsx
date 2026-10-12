import React from 'react';
import { Image, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { TransactionCard } from '@/components/wallet/detail/TransactionCard';
import { detailHeader, detailTime } from '@/lib/wallet/detail';
import type { WalletTransactionDetail } from '@/models/wallet';
import { DetailColors, DetailLayout, DetailType } from '@/theme';

const LOGO = require('../../../assets/images/costonomy-logo.png');

/**
 * The picture "Share receipt" sends: a white band with the Costonomy logo, the status
 * title and the time, over the grey page with the same card as the screen, minus the copy
 * icons, the action row, the support row and any footer. 360 dp wide so that a capture at
 * 1080 px is exactly 3x.
 *
 * <p>Mounted off-screen by the detail screen and read by view-shot; `collapsable={false}`
 * keeps Android from flattening the view away before it can be captured.
 */
export function ReceiptCard({
  entry, onLayout, ref,
}: {
  entry: WalletTransactionDetail;
  onLayout?: (e: LayoutChangeEvent) => void;
  ref?: React.Ref<View>;
}) {
  const header = detailHeader(entry.status);
  return (
    <View ref={ref} collapsable={false} onLayout={onLayout} style={styles.page} testID="receipt-card-root">
      <View style={styles.band}>
        <Image
          source={LOGO}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="Costonomy"
        />
        <Text style={styles.title}>{header.title}</Text>
        <Text style={styles.time}>{detailTime(entry.at)}</Text>
      </View>
      <TransactionCard entry={entry} variant="receipt" expanded />
      <View style={styles.bottom} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { width: DetailLayout.receiptWidth, backgroundColor: DetailColors.page },
  band: { height: DetailLayout.receiptBand, backgroundColor: DetailColors.card },
  logo: {
    position: 'absolute',
    left: DetailLayout.receiptLogoLeft,
    top: (DetailLayout.receiptBand - DetailLayout.receiptLogoHeight) / 2,
    width: DetailLayout.receiptLogoWidth,
    height: DetailLayout.receiptLogoHeight,
  },
  title: {
    ...DetailType.bandTitle,
    position: 'absolute',
    left: DetailLayout.receiptTitleLeft,
    top: 10.6,
    color: DetailColors.bandTitle,
  },
  time: {
    ...DetailType.bandTime,
    position: 'absolute',
    left: DetailLayout.receiptTitleLeft,
    top: 26.6,
    color: DetailColors.bandTime,
  },
  bottom: { height: DetailLayout.receiptBottom },
});
