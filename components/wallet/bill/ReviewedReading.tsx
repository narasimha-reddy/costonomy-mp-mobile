import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSession } from '@/contexts/SessionProvider';
import { Chip } from '@/components/wallet/review/fields';
import { formatDay, parseToISODate } from '@/lib/wallet/billReview';
import type { InvoiceReview } from '@/models/wallet';
import { formatMoney, formatQuantity } from '@/utils/money';
import { BillType, DetailColors, Spacing } from '@/theme';

const pad = (n: number) => String(n).padStart(2, '0');

/** "3 Oct 2026, 09:11" in the phone's time, or null. */
export function reviewedAtText(at: string | null | undefined): string | null {
  if (!at) return null;
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return null;
  const day = formatDay(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  return `${day}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const dateText = (value: string | null) => (value ? formatDay(parseToISODate(value)) || value : null);

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

/**
 * The owner's saved review, in place of the raw reading: supplier, bill number, dates, payment status,
 * the items as resolved to SKUs, and the server's totals exactly as it computed them.
 */
export function ReviewedReading({ review }: { review: InvoiceReview }) {
  const { me } = useSession();
  const at = reviewedAtText(review.reviewedAt);
  const mine = review.reviewedBy != null && me?.user?.id != null && review.reviewedBy === me.user.id;
  const anyTax = review.items.some((it) => it.tax != null && Number(it.tax) !== 0);
  const totals = [
    { label: 'Subtotal', value: review.subtotal },
    { label: 'Tax', value: review.tax },
    { label: 'Delivery', value: review.delivery },
    { label: 'Total', value: review.total, strong: true },
  ].filter((t) => t.value != null);

  return (
    <View style={styles.card} testID="reviewed-reading">
      <View style={styles.head}>
        <Text style={styles.vendor} accessibilityRole="header">{review.supplier.name || 'Bill'}</Text>
        <Chip label="Reviewed" tone="resolved" testID="reviewed-chip" />
      </View>
      <Text style={styles.edited}>{mine ? 'Edited by you' : 'Reviewed'}{at ? ` · ${at}` : ''}</Text>
      <Field label="Bill no." value={review.invoiceNumber} />
      <Field label="Invoice date" value={dateText(review.invoiceDate)} />
      <Field label="Stock-in date" value={dateText(review.stockInDate)} />
      <Field label="Payment status" value={review.paymentStatus === 'COMPLETED' ? 'Completed' : 'Pending'} />

      {review.items.length > 0 && (
        <View style={styles.table} testID="reviewed-items">
          <View style={styles.tr}>
            <Text style={[styles.th, styles.cName]}>Item</Text>
            <Text style={[styles.th, styles.cQty]}>Qty</Text>
            {anyTax ? <Text style={[styles.th, styles.cTax]}>Tax</Text> : null}
            <Text style={[styles.th, styles.cAmt]}>Amount</Text>
          </View>
          {review.items.map((it, i) => (
            // Added lines have no lineNo (null), so the position keys the row.
            <View key={`${it.lineNo ?? 'added'}-${i}`} style={[styles.tr, styles.trBorder]} testID="reviewed-item">
              <View style={styles.cName}>
                <Text style={styles.td}>{it.sku?.name ?? it.fromInvoice?.name ?? '—'}</Text>
                {it.fromInvoice?.name && it.sku?.name && it.fromInvoice.name !== it.sku.name ? (
                  <Text style={styles.sub}>On the bill: {it.fromInvoice.name}</Text>
                ) : null}
              </View>
              <Text style={[styles.td, styles.cQty]}>{formatQuantity(it.quantity, it.unit)}</Text>
              {anyTax ? <Text style={[styles.td, styles.cTax]}>{formatMoney(it.tax)}</Text> : null}
              <Text style={[styles.td, styles.cAmt]}>{formatMoney(it.amount)}</Text>
            </View>
          ))}
        </View>
      )}

      {totals.map((t) => (
        <View key={t.label} style={styles.totalRow}>
          <Text style={t.strong ? styles.totalStrong : styles.totalLabel}>{t.label}</Text>
          <Text style={t.strong ? styles.totalStrong : styles.totalLabel} testID={`reviewed-${t.label.toLowerCase()}`}>{formatMoney(t.value)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: DetailColors.card, borderRadius: 8, padding: 14, gap: Spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  vendor: { ...BillType.title, color: DetailColors.name, flexShrink: 1 },
  edited: { ...BillType.small, color: DetailColors.secondary, marginTop: -Spacing.xs },
  field: { gap: 1 },
  label: { ...BillType.small, color: DetailColors.secondary },
  value: { ...BillType.body, color: DetailColors.name },
  table: { marginTop: 6 },
  tr: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 6, gap: 6 },
  trBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DetailColors.divider },
  th: { ...BillType.tableHead, color: DetailColors.secondary },
  td: { ...BillType.small, color: DetailColors.name },
  sub: { ...BillType.small, color: DetailColors.secondary },
  cName: { flex: 3 },
  cQty: { flex: 1.5, textAlign: 'right' },
  cTax: { flex: 1.4, textAlign: 'right' },
  cAmt: { flex: 1.8, textAlign: 'right' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { ...BillType.body, color: DetailColors.secondary },
  totalStrong: { ...BillType.bodyStrong, color: DetailColors.title },
});
