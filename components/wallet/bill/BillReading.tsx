import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { checkBanner } from '@/lib/wallet/bill';
import { formatRupees } from '@/lib/wallet/history';
import type { InvoiceCheck, InvoiceReading } from '@/models/wallet';
import { BillColors, BillLayout, BillType, DetailColors } from '@/theme';

const TONES = {
  match: { bg: BillColors.matchBg, fg: BillColors.matchText, icon: 'checkmark-circle' },
  differs: { bg: BillColors.differBg, fg: BillColors.differText, icon: 'alert-circle' },
  none: { bg: BillColors.noneBg, fg: BillColors.noneText, icon: 'help-circle' },
} as const;

/** The server's check of the bill total against the payment. A warning only: nothing is blocked. */
export function CheckBanner({ check }: { check: InvoiceCheck | null | undefined }) {
  const banner = checkBanner(check);
  if (banner == null) return null;
  const tone = TONES[banner.tone];
  return (
    <View
      style={[styles.banner, { backgroundColor: tone.bg }]}
      accessibilityRole="summary"
      accessibilityLabel={banner.text}
      testID={`check-${banner.tone}`}
    >
      <Ionicons name={tone.icon} size={20} color={tone.fg} />
      <View style={styles.bannerBody}>
        <Text style={[styles.bannerText, { color: tone.fg }]}>{banner.text}</Text>
        {banner.note ? <Text style={styles.bannerNote} testID="check-note">{banner.note}</Text> : null}
      </View>
    </View>
  );
}

const money = (n: number | null | undefined) => (n == null ? '—' : formatRupees(n));
const text = (n: number | null | undefined) => (n == null ? '—' : String(n));

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

/** What was read off the bill: shop, bill number and date as read, customer, the items and the totals. */
export function BillReading({ reading }: { reading: InvoiceReading }) {
  const items = reading.items ?? [];
  const totals: { label: string; value: number | null; strong?: boolean }[] = [
    { label: 'Subtotal', value: reading.subtotal },
    { label: 'Tax', value: reading.tax },
    { label: 'Delivery', value: reading.delivery },
    { label: 'Total', value: reading.total, strong: true },
  ].filter((t) => t.value != null);

  return (
    <View style={styles.card} testID="bill-reading">
      <Text style={styles.vendor} accessibilityRole="header">{reading.vendorName ?? 'Bill'}</Text>
      <Field label="Address" value={reading.vendorAddress} />
      <Field
        label="Bill no. and date"
        value={[reading.invoiceNumber, reading.invoiceDate].filter(Boolean).join(' · ') || null}
      />
      <Field label="Customer" value={reading.customerName} />

      {items.length > 0 && (
        <View style={styles.table} testID="bill-items">
          <View style={styles.tr}>
            <Text style={[styles.th, styles.cName]}>Item</Text>
            <Text style={[styles.th, styles.cQty]}>Qty</Text>
            <Text style={[styles.th, styles.cRate]}>Rate</Text>
            <Text style={[styles.th, styles.cAmt]}>Amount</Text>
          </View>
          {items.map((it, i) => (
            <View key={`${it.name}-${i}`} style={[styles.tr, styles.trBorder]} testID="bill-item">
              <Text style={[styles.td, styles.cName]}>{it.name ?? '—'}</Text>
              <Text style={[styles.td, styles.cQty]}>
                {it.quantity == null ? '—' : `${text(it.quantity)}${it.unit ? ` ${it.unit}` : ''}`}
              </Text>
              <Text style={[styles.td, styles.cRate]}>{money(it.unitPrice)}</Text>
              <Text style={[styles.td, styles.cAmt]}>{money(it.total)}</Text>
            </View>
          ))}
        </View>
      )}

      {totals.map((t) => (
        <View key={t.label} style={styles.totalRow}>
          <Text style={t.strong ? styles.totalStrong : styles.totalLabel}>{t.label}</Text>
          <Text style={t.strong ? styles.totalStrong : styles.totalLabel}>{money(t.value)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: BillLayout.bannerRadius,
  },
  bannerBody: { flex: 1, gap: 2 },
  bannerText: { ...BillType.bodyStrong },
  bannerNote: { ...BillType.small, color: DetailColors.secondary },
  card: { backgroundColor: DetailColors.card, borderRadius: 8, padding: 14, gap: 8 },
  vendor: { ...BillType.title, color: DetailColors.name },
  field: { gap: 1 },
  label: { ...BillType.small, color: DetailColors.secondary },
  value: { ...BillType.body, color: DetailColors.name },
  table: { marginTop: 6 },
  tr: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 6, gap: 6 },
  trBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DetailColors.divider },
  th: { ...BillType.tableHead, color: DetailColors.secondary },
  td: { ...BillType.small, color: DetailColors.name },
  cName: { flex: 3 },
  cQty: { flex: 1.6, textAlign: 'right' },
  cRate: { flex: 1.5, textAlign: 'right' },
  cAmt: { flex: 1.8, textAlign: 'right' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { ...BillType.body, color: DetailColors.secondary },
  totalStrong: { ...BillType.bodyStrong, color: DetailColors.title },
});
