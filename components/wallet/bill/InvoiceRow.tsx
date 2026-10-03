import React from 'react';
import {
  Image, Pressable, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ReadingDots } from '@/components/wallet/bill/ReadingDots';
import { BillStatusChip } from '@/components/wallet/BillStatusChip';
import { invoiceRowCopy } from '@/lib/wallet/bill';
import {
  billChipCopy, chipVariant, chipWidth, estimateTextWidth, type ChipVariant,
} from '@/lib/wallet/billChip';
import type { WalletBillStatus, WalletInvoiceSummary } from '@/models/wallet';
import { BillColors, BillLayout, DetailColors, DetailLayout, DetailType } from '@/theme';

/**
 * The "Invoice" row inside the details card: thumbnail, what was read, chevron. Tap opens the viewer.
 * With `status` the bill's chip sits beside the title, the same words History uses.
 */
export function InvoiceRow({ invoice, onPress, status }: {
  invoice: WalletInvoiceSummary;
  onPress: () => void;
  status?: WalletBillStatus;
}) {
  const copy = invoiceRowCopy(invoice);
  const [thumbFailed, setThumbFailed] = React.useState(false);
  const showThumb = invoice.thumbnailUrl != null && !thumbFailed;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={status != null ? `Invoice, ${billChipCopy(status).a11y}, ${copy.subtitle}` : `Invoice, ${copy.subtitle}`}
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
        {status != null ? (
          <TitleWithChip title={copy.title} status={status} />
        ) : (
          <Text style={styles.title}>{copy.title}</Text>
        )}
        {copy.state === 'reading' ? (
          <View style={styles.reading}>
            <Text style={styles.sub}>{copy.subtitle}</Text>
            {/* The READING chip already animates: one set of dots on the row is enough. */}
            {status !== 'READING' && <ReadingDots />}
          </View>
        ) : (
          <Text style={styles.sub} numberOfLines={1}>{copy.subtitle}</Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={DetailLayout.chevron} color={DetailColors.icon} />
    </Pressable>
  );
}

/**
 * "Invoice" and the bill's chip on one line. On a narrow screen or with big text the chip takes
 * its short word or its icon, the same steps as History, rather than running into the chevron;
 * only when not even the icon fits beside the title does the chip move under it.
 */
function TitleWithChip({ title, status }: { title: string; status: WalletBillStatus }) {
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = React.useState<number | null>(null);
  const onLayout = React.useCallback((e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    setWidth((prev) => (prev === w ? prev : w));
  }, []);
  let variant: ChipVariant = 'full';
  if (width != null) {
    const beside = width - estimateTextWidth(title, DetailType.name.fontSize * fontScale, 'regular') - TITLE_CHIP_GAP;
    // Not even the icon fits beside the whole title: the chip takes the next line, where it has
    // the whole width (this page has room to grow; History's rows do not).
    variant = chipVariant(beside >= chipWidth('icon', status, fontScale) ? beside : width, fontScale, status);
  }
  return (
    <View style={styles.titleLine} onLayout={onLayout} testID="invoice-title-line">
      <Text style={[styles.title, styles.titleText]} numberOfLines={1}>{title}</Text>
      <BillStatusChip status={status} variant={variant} />
    </View>
  );
}

const TITLE_CHIP_GAP = 8;

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
  titleLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: TITLE_CHIP_GAP, rowGap: 4 },
  // "Invoice" never gives way to its chip; the chip steps down to the icon instead.
  titleText: { flexShrink: 0 },
  title: { ...DetailType.name, color: DetailColors.name },
  sub: { ...DetailType.sub, marginTop: DetailLayout.subTop, color: DetailColors.secondary },
  reading: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 0 },
});
