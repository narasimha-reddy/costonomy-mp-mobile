import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiText } from '@/components/common/MandiText';
import { AmountRow } from './AmountRow';
import { paymentLine, type CreditDates } from '@/lib/payments/paymentLine';
import type { SupplierOrder } from '@/models/procurement';
import { Colors, IconSize, Radius, Spacing } from '@/theme';
import { formatGstRate, formatMoney, type Money } from '@/utils/money';
import { skuSecondaryLine, type SkuDescriptor } from '@/utils/skuLabel';

export interface BillLine {
  label: string;
  amount: Money;
  /** The ordered figure, drawn struck, when the line changed. */
  strike?: Money | null;
  tone?: 'normal' | 'saving';
  /** Said instead of the amount ("Free"); the amount is then not drawn. */
  valueText?: string;
}

export interface BillSummaryProps {
  lines: BillLine[];
  grandTotal: Money;
  /** What was refunded at check-in, as its own line between the grand total and the final line. */
  refundLine?: { label: string; amount: Money } | null;
  finalLine: { label: string; amount: Money };
  /** Drawn only when above zero. The backend sends none in v1. */
  savings?: Money | null;
}

type BillOrder = Pick<
  SupplierOrder,
  'status' | 'paymentMethod' | 'paymentStatus' | 'totalAmount' | 'acceptedAmount' | 'subtotal' | 'gstAmount'
  | 'acceptedSubtotal' | 'acceptedGst' | 'deliveryFee' | 'deliveryMode' | 'finalPayableAmount' | 'doorstepRefundAmount'
> & CreditDates & { paymentInstrument?: string | null };

/**
 * The props for an order's bill. Every figure is a field the server sent, picked and never added: a total worked
 * out here could disagree with what the supplier invoices and the payment captures, by a paisa or by a fee the
 * client does not know about.
 */
export function billSummaryFor(order: BillOrder, settled: boolean, credit?: CreditDates | null): BillSummaryProps {
  const lines: BillLine[] = [
    { label: 'Item total', amount: settled ? order.acceptedSubtotal : order.subtotal },
    { label: 'GST', amount: settled ? order.acceptedGst : order.gstAmount },
  ];
  // A collected order has no delivery partner, so no fee line, not even a "Free" one.
  if (order.deliveryFee != null && order.deliveryMode != null && order.deliveryMode !== 'PICKUP') {
    // Only a Costonomy delivery has a partner; a supplier's own run is just a "Delivery fee".
    const label = order.deliveryMode === 'COSTONOMY_DELIVERY' ? 'Delivery partner fee' : 'Delivery fee';
    lines.push(Number(order.deliveryFee) > 0
      ? { label, amount: order.deliveryFee }
      : { label, amount: order.deliveryFee, valueText: 'Free', tone: 'saving' });
  }
  const final = paymentLine(order, credit);
  // The check-in refund, said by the server: shown only when it sent an amount above zero.
  const refunded = order.doorstepRefundAmount != null && Number(order.doorstepRefundAmount) > 0;
  const refundLabel = order.paymentMethod === 'WALLET' ? 'Refunded to wallet'
    : order.paymentMethod === 'CREDIT' ? 'Taken off credit' : 'Refunded';
  return {
    lines,
    grandTotal: settled ? (order.acceptedAmount as Money) : order.totalAmount,
    refundLine: refunded ? { label: refundLabel, amount: order.doorstepRefundAmount as Money } : null,
    finalLine: { label: final.label, amount: final.amount },
  };
}

/**
 * The small line under an order item's pack line: "Inc. 5% GST". The pack line above already names the pack and
 * its unit, so the ordering unit leads here only when there is no pack line to say it (it never stands alone).
 */
export function itemTaxLine(item: {
  sku: SkuDescriptor | null | undefined;
  unit: string | null | undefined;
  unitPriceInclusiveGst: Money | null | undefined;
  gstRate: Money;
}): string {
  const gst = `Inc. ${formatGstRate(item.gstRate)} GST`;
  const packShown = skuSecondaryLine(item.sku, item.unitPriceInclusiveGst) !== '';
  return !packShown && item.unit ? `${item.unit} · ${gst}` : gst;
}

/** "Bill summary": one card, a row per server figure, the grand total, then what is left to pay or was paid. */
export function BillSummary({ lines, grandTotal, refundLine, finalLine, savings }: BillSummaryProps) {
  const saved = savings != null && Number(savings) > 0;
  return (
    <View style={styles.card} testID="bill-summary">
      <View style={styles.header}>
        <Ionicons name="receipt-outline" size={IconSize.lg} color={Colors.textSecondary} />
        <MandiText variant="bodyEmphasis" accessibilityRole="header">Bill summary</MandiText>
      </View>
      {lines.map((line) => (
        <View key={line.label} style={styles.row}>
          <MandiText variant="body" color={Colors.textSecondary} style={styles.label}>{line.label}</MandiText>
          <View style={styles.value}>
            {line.strike != null && (
              <MandiText variant="caption" color={Colors.textTertiary} struck>{formatMoney(line.strike)}</MandiText>
            )}
            <MandiText
              variant="body"
              color={line.tone === 'saving' ? Colors.successText : undefined}
            >
              {line.valueText ?? formatMoney(line.amount)}
            </MandiText>
          </View>
        </View>
      ))}
      <View style={[styles.row, styles.divided]}>
        <MandiText variant="bodyEmphasis" style={styles.label}>Grand total</MandiText>
        <MandiText variant="bodyEmphasis">{formatMoney(grandTotal)}</MandiText>
      </View>
      {refundLine != null && (
        <AmountRow label={refundLine.label} amount={formatMoney(refundLine.amount)} color={Colors.successText} />
      )}
      <View style={styles.row}>
        <MandiText variant="bodyEmphasis" style={styles.label}>{finalLine.label}</MandiText>
        <MandiText variant="bodyEmphasis">{formatMoney(finalLine.amount)}</MandiText>
      </View>
      {saved && (
        <View style={styles.saved}>
          <MandiText variant="captionEmphasis" color={Colors.successText}>
            {`You saved ${formatMoney(savings)}`}
          </MandiText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  label: { flex: 1, minWidth: 0 },
  value: { flexShrink: 0, alignItems: 'flex-end' },
  divided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    paddingTop: Spacing.sm,
  },
  saved: {
    backgroundColor: Colors.successLight,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    alignItems: 'center',
  },
});
