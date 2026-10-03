import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { InvoiceRow } from '@/components/wallet/bill/InvoiceRow';
import { BillStatusChip } from '@/components/wallet/BillStatusChip';
import { MandiBottomSheet, MandiButton, MandiText } from '@/components/common';
import type { DetailBillStatus, WalletBillStatus, WalletTransactionDetail } from '@/models/wallet';
import { BillStatusColors, DetailColors, DetailLayout, DetailType, TouchTarget } from '@/theme';

const FROM_BILL: readonly DetailBillStatus[] = ['READING', 'ADDED', 'REVIEWED', 'UNREADABLE'];

/** The chip for a bill that exists: the server's word when it is a bill word, else read off the invoice. */
function invoiceChipStatus(entry: WalletTransactionDetail): WalletBillStatus | undefined {
  if (entry.billStatus != null && FROM_BILL.includes(entry.billStatus)) return entry.billStatus as WalletBillStatus;
  switch (entry.invoice?.status) {
    case 'READING': return 'READING';
    case 'READ': return 'ADDED';
    case 'UNREADABLE': return 'UNREADABLE';
    default: return undefined;
  }
}

/**
 * Where the bill stands, inside the details card: the Invoice row with its chip, a "Bill pending"
 * row with "No bill needed", or the quiet "No bill needed" note with "Undo". Nothing when the
 * payment takes no bill (or the server is older and says nothing).
 *
 * <p>Waiving needs QUICKSCAN_PAY; hiding the buttons is a courtesy, the server enforces it.
 */
export function BillStatusSection({
  entry, mayChangeBill, busy = false, onInvoice, onWaiveBill, onUndoWaiver,
}: {
  entry: WalletTransactionDetail;
  mayChangeBill: boolean;
  busy?: boolean;
  onInvoice?: () => void;
  onWaiveBill?: () => Promise<void> | void;
  onUndoWaiver?: () => Promise<void> | void;
}) {
  const [confirming, setConfirming] = useState(false);

  if (entry.invoice != null) {
    return <InvoiceRow invoice={entry.invoice} status={invoiceChipStatus(entry)} onPress={() => onInvoice?.()} />;
  }

  if (entry.billStatus === 'PENDING') {
    const canWaive = entry.actions.canWaiveBill === true && mayChangeBill;
    // The sheet stays open, its button spinning, until the server has answered.
    const confirm = async () => {
      try {
        await onWaiveBill?.();
      } finally {
        setConfirming(false);
      }
    };
    return (
      <View style={styles.section} testID="bill-status-section">
        <View style={styles.line}>
          <Text style={styles.title}>Bill</Text>
          <BillStatusChip status="PENDING" />
        </View>
        {canWaive ? (
          <Pressable
            onPress={() => setConfirming(true)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="No bill needed"
            accessibilityState={{ disabled: busy }}
            style={styles.textButton}
            testID="bill-waive"
          >
            <Text style={[styles.buttonText, busy && styles.disabled]}>No bill needed</Text>
          </Pressable>
        ) : null}
        <MandiBottomSheet
          visible={confirming}
          onClose={() => setConfirming(false)}
          title="Mark as no bill needed?"
          closeLabel="Close"
          testID="bill-waive-sheet"
        >
          <MandiText variant="body">You can undo this.</MandiText>
          <View style={styles.sheetButtons}>
            <MandiButton label="No bill needed" onPress={() => { void confirm(); }} loading={busy} testID="bill-waive-confirm" />
            <MandiButton label="Cancel" variant="tertiary" onPress={() => setConfirming(false)} disabled={busy} testID="bill-waive-cancel" />
          </View>
        </MandiBottomSheet>
      </View>
    );
  }

  if (entry.billStatus === 'NOT_REQUIRED') {
    const canUndo = entry.actions.canUndoWaiver === true && mayChangeBill;
    return (
      <View style={[styles.section, styles.line]} testID="bill-status-section">
        <Text style={styles.quiet} testID="bill-not-required">No bill needed</Text>
        {canUndo ? (
          <Pressable
            onPress={() => { void onUndoWaiver?.(); }}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Undo, a bill is needed again"
            accessibilityState={{ disabled: busy }}
            style={styles.textButton}
            testID="bill-undo-waiver"
          >
            <Text style={[styles.buttonText, busy && styles.disabled]}>Undo</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  section: { marginHorizontal: DetailLayout.dividerInset - 6, marginTop: 8 },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { ...DetailType.name, color: DetailColors.name },
  quiet: { ...DetailType.sub, color: BillStatusColors.notRequiredText },
  textButton: { minHeight: TouchTarget.min, justifyContent: 'center', alignSelf: 'flex-start' },
  buttonText: { ...DetailType.sub, color: BillStatusColors.bannerAction },
  disabled: { opacity: 0.5 },
  sheetButtons: { marginTop: 12, gap: 8 },
});
