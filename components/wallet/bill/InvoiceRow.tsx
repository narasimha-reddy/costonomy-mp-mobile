import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ReadingDots } from '@/components/wallet/bill/ReadingDots';
import { invoiceRowCopy } from '@/lib/wallet/bill';
import type { WalletInvoiceSummary } from '@/models/wallet';
import { BillColors, BillLayout, DetailColors, DetailLayout, DetailType } from '@/theme';

/** The "Invoice" row inside the details card: thumbnail, what was read, chevron. Tap opens the viewer. */
export function InvoiceRow({ invoice, onPress }: { invoice: WalletInvoiceSummary; onPress: () => void }) {
  const copy = invoiceRowCopy(invoice);
  const [thumbFailed, setThumbFailed] = React.useState(false);
  const showThumb = invoice.thumbnailUrl != null && !thumbFailed;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Invoice, ${copy.subtitle}`}
      style={styles.row}
      testID="invoice-row"
      android_ripple={{ color: DetailColors.divider }}
    >
      <View style={styles.thumb}>
        {showThumb ? (
          <Image
            source={{ uri: invoice.thumbnailUrl as string }}
            style={styles.thumbImage}
            resizeMode="cover"
            onError={() => setThumbFailed(true)}
            testID="invoice-thumb"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Ionicons name="document-text-outline" size={20} color={DetailColors.icon} />
        )}
      </View>
      <View style={styles.texts}>
        <Text style={styles.title}>{copy.title}</Text>
        {copy.state === 'reading' ? (
          <View style={styles.reading}>
            <Text style={styles.sub}>{copy.subtitle}</Text>
            <ReadingDots />
          </View>
        ) : (
          <Text style={styles.sub} numberOfLines={1}>{copy.subtitle}</Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={DetailLayout.chevron} color={DetailColors.icon} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    marginHorizontal: DetailLayout.dividerInset - 6,
    marginTop: BillLayout.rowVertical,
    paddingVertical: 4,
  },
  thumb: {
    width: BillLayout.thumbWidth,
    height: BillLayout.thumbHeight,
    borderRadius: BillLayout.thumbRadius,
    backgroundColor: BillColors.thumbBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BillColors.thumbBorder,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImage: { width: '100%', height: '100%' },
  texts: { flex: 1, marginLeft: BillLayout.rowGap, marginRight: 8 },
  title: { ...DetailType.name, color: DetailColors.name },
  sub: { ...DetailType.sub, marginTop: DetailLayout.subTop, color: DetailColors.secondary },
  reading: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 0 },
});
