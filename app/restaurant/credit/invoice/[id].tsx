import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  MandiButton,
  MandiCard,
  MandiEmptyState,
  MandiErrorState,
  MandiHeader,
  MandiScreen,
  MandiSectionHeader,
  MandiSkeletonList,
  MandiStatusChip,
  MandiStickyBar,
  MandiText,
} from '@/components/common';
import { CreditPaymentRow } from '@/components/credit/CreditPaymentRow';
import { PayFromWalletSheet } from '@/components/credit/PayFromWalletSheet';
import { useCreditInvoice, useWalletRepayEnabled } from '@/hooks/useCreditInvoice';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { dueChip } from '@/lib/credit/dueChip';
import { ApiError } from '@/lib/api/errors';
import type { CreditInvoiceStatus } from '@/models/credit';
import { formatDay } from '@/utils/dateRange';
import { formatMoney } from '@/utils/money';
import { Colors, IconSize, Spacing } from '@/theme';

const STATUS_TEXT: Record<CreditInvoiceStatus, string> = {
  ISSUED: 'Issued',
  PARTIALLY_PAID: 'Part paid',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
  WRITTEN_OFF: 'Written off',
};

function Line({ label, value, testID, strong }: { label: string; value: string; testID?: string; strong?: boolean }) {
  return (
    <View style={styles.line} accessible accessibilityLabel={`${label} ${value}`} testID={testID}>
      <MandiText variant="body" color={Colors.textSecondary}>{label}</MandiText>
      <MandiText variant={strong ? 'bodyEmphasis' : 'body'}>{value}</MandiText>
    </View>
  );
}

/**
 * One credit invoice: what it is, what is owed, and every payment against it.
 *
 * <p>Every figure and every due word comes from the server; this screen only
 * formats them. Paying is offered only while something is owed and the server
 * allows repaying from the wallet.
 */
export default function CreditInvoiceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const raw = Array.isArray(params.id) ? params.id[0] : params.id;
  const invoiceId = Number(raw);
  const query = useCreditInvoice(invoiceId);
  const repayEnabled = useWalletRepayEnabled();
  const { offline } = useNetworkStatus();
  const [sheetOpen, setSheetOpen] = useState(false);

  const invoice = query.data;
  const goBack = () => (router.canGoBack?.() === false ? router.replace('/restaurant/credit') : router.back());
  const notFound = query.error instanceof ApiError && query.error.status === 404;

  const header = (
    <MandiHeader title={invoice?.invoiceNumber ?? 'Invoice'} subtitle={invoice?.supplierName ?? undefined} back />
  );

  if (notFound) {
    return (
      <MandiScreen header={header}>
        <MandiEmptyState
          icon="document-text-outline"
          title="This invoice isn't available"
          description="It may have been removed, or it belongs to another account."
          actionLabel="Go back"
          onAction={goBack}
          testID="invoice-not-found"
        />
      </MandiScreen>
    );
  }

  if (query.isPending && invoice == null) {
    return (
      <MandiScreen header={header}>
        <MandiSkeletonList count={3} />
      </MandiScreen>
    );
  }

  if (invoice == null) {
    return (
      <MandiScreen header={header}>
        <MandiErrorState
          message="Couldn't load this invoice."
          onRetry={() => { void query.refresh(); }}
          retrying={query.isFetching}
          testID="invoice-error"
        />
      </MandiScreen>
    );
  }

  const chip = dueChip(invoice.dueState, invoice.daysToDue);
  const settled = invoice.status === 'PAID' || invoice.status === 'WRITTEN_OFF'
    || invoice.dueState === 'PAID' || invoice.dueState === 'WRITTEN_OFF';
  const owes = Number(invoice.outstanding) > 0;
  const canPay = !settled && owes && repayEnabled;
  const orderLabel = invoice.orderNumber ?? (invoice.supplierOrderId != null ? String(invoice.supplierOrderId) : null);
  const issued = formatDay(invoice.issuedAt);
  const due = formatDay(invoice.dueDate);
  const lateAfter = formatDay(invoice.overdueAfter);
  const settledOn = formatDay(invoice.settledAt);

  return (
    <>
      <MandiScreen
        header={header}
        onRefresh={() => { void query.refresh(); }}
        refreshing={query.isRefetching}
        footer={canPay ? (
          <MandiStickyBar>
            <MandiButton
              label={`Pay ${formatMoney(invoice.outstanding)}`}
              onPress={() => setSheetOpen(true)}
              disabled={offline}
              testID="invoice-pay"
            />
            {offline && (
              <MandiText variant="caption" color={Colors.textSecondary}>
                Reconnect to pay.
              </MandiText>
            )}
          </MandiStickyBar>
        ) : undefined}
      >
        <MandiCard>
          <View style={styles.statusRow}>
            {chip != null && <MandiStatusChip label={chip.label} tone={chip.tone} testID="invoice-chip" />}
            <MandiText variant="body" testID="invoice-status">
              {`Status: ${STATUS_TEXT[invoice.status] ?? invoice.status}`}
            </MandiText>
          </View>
          {orderLabel != null && (
            invoice.supplierOrderId != null ? (
              <Pressable
                style={styles.orderLink}
                onPress={() => router.push(`/restaurant/orders/${invoice.supplierOrderId}`)}
                accessibilityRole="link"
                accessibilityLabel={`Order #${orderLabel}. Opens the order`}
                testID="invoice-order-link"
              >
                <MandiText variant="bodyEmphasis" color={Colors.primary}>{`Order #${orderLabel}`}</MandiText>
                <Ionicons name="chevron-forward" size={IconSize.sm} color={Colors.primary} />
              </Pressable>
            ) : (
              <MandiText variant="body" testID="invoice-order-text">{`Order #${orderLabel}`}</MandiText>
            )
          )}
        </MandiCard>

        <MandiCard>
          <Line label="Invoice amount" value={formatMoney(invoice.amount)} testID="invoice-amount" />
          <Line label="Paid" value={formatMoney(invoice.paidAmount)} testID="invoice-paid" />
          <Line label="Still owed" value={formatMoney(invoice.outstanding)} testID="invoice-outstanding" strong />
        </MandiCard>

        <MandiCard>
          {issued != null && <Line label="Issued" value={issued} testID="invoice-issued" />}
          {due != null && <Line label="Due" value={due} testID="invoice-due" />}
          {!settled && lateAfter != null && (
            <Line label="Late after" value={lateAfter} testID="invoice-late-after" />
          )}
          {invoice.status === 'PAID' && settledOn != null && (
            <Line label="Settled" value={settledOn} testID="invoice-settled" />
          )}
        </MandiCard>

        <MandiSectionHeader title="Payments" />
        {invoice.payments.length === 0 ? (
          <MandiText variant="body" color={Colors.textSecondary} testID="payments-empty">
            No payments yet.
          </MandiText>
        ) : (
          <MandiCard>
            {invoice.payments.map((payment) => (
              <CreditPaymentRow
                key={payment.id}
                payment={payment}
                supplierName={invoice.supplierName}
                // History opens a ledger movement by its numeric id, so does this.
                onOpenWallet={(entryId) => router.push(`/restaurant/wallet/transaction/${entryId}`)}
              />
            ))}
          </MandiCard>
        )}
      </MandiScreen>

      {canPay && (
        <PayFromWalletSheet
          visible={sheetOpen}
          onClose={() => setSheetOpen(false)}
          agreementId={invoice.agreementId}
          supplierName={invoice.supplierName ?? 'Supplier'}
          due={invoice.outstanding}
          overdue={invoice.dueState === 'OVERDUE' ? invoice.outstanding : 0}
          invoice={{ id: invoice.id, invoiceNumber: invoice.invoiceNumber, outstanding: invoice.outstanding }}
          onPaid={() => { setSheetOpen(false); void query.refresh(); }}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.xs },
  orderLink: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, minHeight: 44 },
});
