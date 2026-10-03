import React, { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DetailActions } from '@/components/wallet/detail/DetailActions';
import { DetailHeader } from '@/components/wallet/detail/DetailHeader';
import { HelpGlyph } from '@/components/wallet/detail/DetailIcons';
import { BillStatusSection } from '@/components/wallet/detail/BillStatusSection';
import { ReceiptCard } from '@/components/wallet/detail/ReceiptCard';
import { TransactionCard } from '@/components/wallet/detail/TransactionCard';
import { detailHeader, detailTime, receiptFileName } from '@/lib/wallet/detail';
import { shareReceiptImage } from '@/lib/wallet/shareReceipt';
import type { WalletTransactionDetail } from '@/models/wallet';
import { DetailColors, DetailLayout, DetailType } from '@/theme';

/**
 * The Transaction details screen once the entry is loaded: coloured header, the card,
 * the Contact Support row, and (off-screen) the receipt picture that Share Receipt captures.
 *
 * <p>Pure of data fetching and navigation so it can be rendered with a fixture: the screen
 * route passes the handlers.
 */
export function TransactionDetailView({
  entry, onBack, onCopy, onPayAgain, onWallet, onHistory, onSupport, onError, onAddBill, onInvoice, mayChangeBill = false,
  onWaiveBill, onUndoWaiver, billBusy = false,
}: {
  entry: WalletTransactionDetail;
  onBack: () => void;
  onCopy: (value: string, what: string) => void;
  onPayAgain: () => void;
  onWallet: () => void;
  onHistory: () => void;
  onSupport: () => void;
  onError: (message: string) => void;
  onAddBill?: () => void;
  onInvoice?: () => void;
  /** The user holds QUICKSCAN_PAY: without it "Add bill" is not offered. */
  mayChangeBill?: boolean;
  /** "No bill needed" confirmed. */
  onWaiveBill?: () => Promise<void> | void;
  /** "Undo" on a payment marked no bill needed. */
  onUndoWaiver?: () => Promise<void> | void;
  /** A waive or undo is in flight. */
  billBusy?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const header = detailHeader(entry.status);
  const [expanded, setExpanded] = useState(true);
  const [sharing, setSharing] = useState(false);
  const receiptRef = useRef<View>(null);
  const receiptHeight = useRef<number | null>(null);

  const onReceiptLayout = useCallback((e: LayoutChangeEvent) => {
    receiptHeight.current = e.nativeEvent.layout.height;
  }, []);

  const share = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    try {
      await shareReceiptImage(receiptRef.current, receiptFileName(entry.transactionId), receiptHeight.current);
    } catch {
      onError('Could not create receipt');
    } finally {
      setSharing(false);
    }
  }, [sharing, entry.transactionId, onError]);

  return (
    <View style={styles.page}>
      <DetailHeader color={header.color} title={header.title} time={detailTime(entry.at)} onBack={onBack} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + DetailLayout.pageBottom }}
      >
        <View style={styles.top} />
        <TransactionCard
          entry={entry}
          expanded={expanded}
          onToggle={() => setExpanded((v) => !v)}
          onCopy={onCopy}
          invoiceRow={(
            <BillStatusSection
              entry={entry}
              mayChangeBill={mayChangeBill}
              busy={billBusy}
              onInvoice={onInvoice}
              onWaiveBill={onWaiveBill}
              onUndoWaiver={onUndoWaiver}
            />
          )}
          footer={(
            <DetailActions
              canAddBill={entry.actions.canAddBill === true && mayChangeBill}
              hasInvoice={entry.invoice != null}
              onAddBill={onAddBill}
              onInvoice={onInvoice}
              canPayAgain={entry.actions.canPayAgain}
              sharing={sharing}
              onPayAgain={onPayAgain}
              onWallet={onWallet}
              onHistory={onHistory}
              onShare={share}
            />
          )}
        />
        <Pressable
          onPress={onSupport}
          accessibilityRole="button"
          accessibilityLabel="Contact Support"
          style={styles.support}
          testID="contact-support"
          android_ripple={{ color: DetailColors.divider }}
        >
          <HelpGlyph size={DetailLayout.supportIcon} color={DetailColors.icon} />
          <Text style={styles.supportText}>Contact Support</Text>
          <Ionicons name="chevron-forward" size={DetailLayout.chevron} color={DetailColors.icon} />
        </Pressable>
      </ScrollView>

      {/* Off-screen: the picture Share Receipt captures. Not read out, not touchable. */}
      <View
        style={styles.offscreen}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <ReceiptCard ref={receiptRef} entry={entry} onLayout={onReceiptLayout} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: DetailColors.page },
  scroll: { flex: 1 },
  top: { height: DetailLayout.cardTop },
  support: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: DetailLayout.supportHeight,
    marginHorizontal: DetailLayout.cardMargin,
    marginTop: DetailLayout.supportTop,
    paddingLeft: DetailLayout.supportLeft,
    paddingRight: DetailLayout.supportRight,
    borderRadius: DetailLayout.cardRadius,
    backgroundColor: DetailColors.card,
    shadowColor: DetailColors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 1.5,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  supportText: {
    ...DetailType.sub,
    flex: 1,
    marginLeft: DetailLayout.supportTextGap,
    color: DetailColors.support,
  },
  offscreen: { position: 'absolute', left: -10000, top: 0, width: DetailLayout.receiptWidth },
});
