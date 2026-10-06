import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { fetchCreditInvoice } from '@/services/credit';
import { ClaimReviewSheet } from '@/components/credit/ClaimReviewSheet';
import { ExtendDueSheet } from '@/components/credit/ExtendDueSheet';
import { RecordPaymentSheet } from '@/components/credit/RecordPaymentSheet';
import {
  MandiButton,
  MandiCard,
  MandiEmptyState,
  MandiErrorState,
  MandiHeader,
  MandiOfflineBanner,
  MandiScreen,
  MandiSectionHeader,
  MandiSkeletonList,
  MandiStatusChip,
  MandiText,
  useToast,
} from '@/components/common';
import { useDecideClaim } from '@/hooks/useDecideClaim';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { usePermissions } from '@/hooks/usePermissions';
import { ApiError } from '@/lib/api/errors';
import { duplicateWarning, mayDecideClaims, waitingText } from '@/lib/credit/claimInbox';
import { claimMethodLabel } from '@/lib/credit/claims';
import { dueChip } from '@/lib/credit/dueChip';
import { isSettled } from '@/lib/credit/invoices';
import { paymentDetail } from '@/lib/credit/payments';
import { paymentBadge } from '@/lib/credit/supplierLine';
import { supplierInvoiceKey } from '@/lib/queryKeys';
import type { ClaimStatus, CreditInvoiceStatus } from '@/models/credit';
import { formatDay } from '@/utils/dateRange';
import { formatMoney } from '@/utils/money';
import { Colors, Spacing } from '@/theme';

const STATUS_TEXT: Record<CreditInvoiceStatus, string> = {
  ISSUED: 'Issued',
  PARTIALLY_PAID: 'Part paid',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
  WRITTEN_OFF: 'Written off',
};
const CLAIM_STATUS_TEXT: Record<ClaimStatus, string> = {
  SUBMITTED: 'Waiting for you',
  CONFIRMED: 'Confirmed',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn by the restaurant',
  SUPERSEDED: 'Not needed: the invoice was settled',
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
 * One credit invoice, from the supplier's side. Plan S3.
 *
 * <p>Every figure, state and date is the server's (`GET /credit/invoices/{id}`); this words them.
 * Record payment and Extend due date show only while the invoice is open and the person has the
 * permission (CREDIT_COLLECT or CREDIT_MODIFY to record, CREDIT_MODIFY to extend); the server
 * checks again. Waiting claims can be confirmed or rejected here with the same sheet as the inbox.
 */
export default function SupplierInvoiceScreen() {
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const raw = Array.isArray(params.id) ? params.id[0] : params.id;
  const invoiceId = Number(raw);
  const { accessToken } = useSession();
  const { store } = useStore();
  const { offline } = useNetworkStatus();
  const { canForStore } = usePermissions();
  const canCollect = mayDecideClaims(canForStore, store);
  const canModify = store != null && canForStore('CREDIT_MODIFY', store);
  const decide = useDecideClaim();

  const query = useQuery({
    queryKey: supplierInvoiceKey(invoiceId),
    queryFn: () => fetchCreditInvoice(accessToken as string, invoiceId),
    enabled: Number.isFinite(invoiceId) && accessToken != null,
  });
  const invoice = query.data;

  const [recordOpen, setRecordOpen] = useState(false);
  const [recordSession, setRecordSession] = useState(0);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [extendOpen, setExtendOpen] = useState(false);
  const [extendSession, setExtendSession] = useState(0);
  const [reviewing, setReviewing] = useState<{ id: number; mode: 'review' | 'reject' } | null>(null);

  const goBack = () => (router.canGoBack?.() === false ? router.replace('/supplier/credit') : router.back());
  const notFound = !Number.isFinite(invoiceId)
    || (query.error instanceof ApiError && query.error.status === 404);
  const header = <MandiHeader title={invoice?.invoiceNumber ?? 'Invoice'} subtitle={invoice?.orderNumber != null ? `Order #${invoice.orderNumber}` : undefined} back />;

  if (notFound) {
    return (
      <MandiScreen header={header}>
        <MandiEmptyState
          icon="document-text-outline"
          title="This invoice isn't available to you"
          description="It may belong to another store, or have been removed."
          actionLabel="Go back"
          onAction={goBack}
          testID="invoice-not-found"
        />
      </MandiScreen>
    );
  }
  if (query.isPending && invoice == null) {
    return <MandiScreen header={header}><MandiSkeletonList count={3} /></MandiScreen>;
  }
  if (invoice == null) {
    return (
      <MandiScreen header={header}>
        <MandiErrorState message="Couldn't load this invoice." onRetry={() => { void query.refetch(); }} testID="invoice-error" />
      </MandiScreen>
    );
  }

  const chip = dueChip(invoice.dueState, invoice.daysToDue);
  const open = !isSettled(invoice);
  const owes = Number(invoice.outstanding) > 0;
  const mayRecord = canCollect && open && owes;
  const mayExtend = canModify && open;
  const claims = invoice.claims ?? [];
  const waiting = claims.filter((c) => c.status === 'SUBMITTED');
  const reviewed = reviewing == null ? null : claims.find((c) => c.id === reviewing.id) ?? null;
  const extensions = invoice.extensions ?? [];

  function closeReview() {
    setReviewing(null);
    decide.reset();
    if (recordOpen) setPreviewNonce((n) => n + 1);
  }
  async function confirmFor(claim: (typeof claims)[number], amount: string | null) {
    const response = await decide.confirm(claim, amount);
    if (response != null) {
      closeReview();
      toast.show(`Confirmed. ${formatMoney(response.confirmedAmount ?? response.amount)} recorded.`, 'success');
    }
  }
  async function rejectFor(claim: (typeof claims)[number], reason: string) {
    const response = await decide.reject(claim, reason);
    if (response != null) {
      closeReview();
      toast.show('Done. The restaurant is told you did not receive it.', 'success');
    }
  }

  return (
    <MandiScreen
      header={header}
      onRefresh={() => { void query.refetch(); }}
      refreshing={query.isRefetching}
    >
      <MandiOfflineBanner visible={offline} />

      <MandiCard>
        <View style={styles.statusRow}>
          {chip != null && <MandiStatusChip label={chip.label} tone={chip.tone} testID="invoice-chip" />}
          <MandiText variant="body" testID="invoice-status">
            {`Status: ${STATUS_TEXT[invoice.status] ?? invoice.status}`}
          </MandiText>
        </View>
      </MandiCard>

      <MandiCard>
        <Line label="Invoice amount" value={formatMoney(invoice.amount)} testID="invoice-amount" />
        <Line label="Paid" value={formatMoney(invoice.paidAmount)} testID="invoice-paid" />
        <Line label="Still owed" value={formatMoney(invoice.outstanding)} testID="invoice-outstanding" strong />
      </MandiCard>

      <MandiCard>
        {formatDay(invoice.issuedAt) != null && <Line label="Issued" value={formatDay(invoice.issuedAt) as string} testID="invoice-issued" />}
        {formatDay(invoice.dueDate) != null && <Line label="Due" value={formatDay(invoice.dueDate) as string} testID="invoice-due" />}
        {open && formatDay(invoice.overdueAfter) != null && (
          <Line label="Late after" value={formatDay(invoice.overdueAfter) as string} testID="invoice-late-after" />
        )}
        {invoice.status === 'PAID' && formatDay(invoice.settledAt) != null && (
          <Line label="Settled" value={formatDay(invoice.settledAt) as string} testID="invoice-settled" />
        )}
      </MandiCard>

      {(mayRecord || mayExtend) && (
        <View style={styles.actions}>
          {mayRecord && (
            <MandiButton
              testID="invoice-record"
              label="Record payment for this invoice"
              icon="cash-outline"
              disabled={offline}
              onPress={() => { setRecordSession((n) => n + 1); setPreviewNonce(0); setRecordOpen(true); }}
            />
          )}
          {mayExtend && (
            <MandiButton
              testID="invoice-extend"
              label="Extend due date"
              variant="secondary"
              icon="calendar-outline"
              disabled={offline}
              onPress={() => { setExtendSession((n) => n + 1); setExtendOpen(true); }}
            />
          )}
        </View>
      )}

      <MandiSectionHeader title="Payments" />
      {invoice.payments.length === 0 ? (
        <MandiText variant="body" color={Colors.textSecondary} testID="payments-empty">No payments yet.</MandiText>
      ) : (
        <MandiCard>
          {invoice.payments.map((p) => {
            const badge = paymentBadge(p.source);
            const detail = paymentDetail(p.method, p.reference, p.source);
            const day = formatDay(p.paidAt) ?? '';
            return (
              <View
                key={p.id}
                style={styles.payment}
                accessible
                accessibilityLabel={[formatMoney(p.amount), badge, detail, day].filter(Boolean).join(', ')}
                testID={`invoice-payment-${p.id}`}
              >
                <View style={styles.flex}>
                  <MandiText variant="bodyEmphasis">{badge ?? 'Payment'}</MandiText>
                  {detail != null && <MandiText variant="caption" color={Colors.textSecondary}>{detail}</MandiText>}
                  <MandiText variant="caption" color={Colors.textTertiary}>{day}</MandiText>
                </View>
                <MandiText variant="bodyEmphasis">{formatMoney(p.amount)}</MandiText>
              </View>
            );
          })}
        </MandiCard>
      )}

      {claims.length > 0 && (
        <View style={styles.section} testID="invoice-claims">
          <MandiSectionHeader title="Reported by the restaurant" count={waiting.length > 0 ? waiting.length : undefined} />
          {claims.map((c) => {
            const how = [claimMethodLabel(c.method), c.reference].filter((x) => x != null && x !== '').join(' · ');
            const age = c.status === 'SUBMITTED' ? waitingText(c) : null;
            const duplicate = c.status === 'SUBMITTED' ? duplicateWarning(c) : null;
            return (
              <MandiCard key={c.id} compact testID={`invoice-claim-${c.id}`}>
                <MandiText variant="bodyEmphasis">{formatMoney(c.amount)}</MandiText>
                <MandiText variant="caption" color={Colors.textSecondary}>
                  {`${how} · paid ${formatDay(c.paidOn) ?? c.paidOn}`}
                </MandiText>
                <MandiText variant="caption" color={c.status === 'SUBMITTED' ? Colors.warning : Colors.textTertiary}>
                  {age != null ? `${CLAIM_STATUS_TEXT[c.status]} · ${age}` : CLAIM_STATUS_TEXT[c.status] ?? c.status}
                </MandiText>
                {duplicate != null && <MandiText variant="caption" color={Colors.warning}>{duplicate}</MandiText>}
                {c.status === 'SUBMITTED' && canCollect && (
                  <View style={styles.row}>
                    <MandiButton
                      testID={`invoice-claim-${c.id}-confirm`}
                      label="Confirm"
                      size="md"
                      disabled={offline}
                      onPress={() => { decide.reset(); setReviewing({ id: c.id, mode: 'review' }); }}
                      style={styles.flex}
                    />
                    <MandiButton
                      testID={`invoice-claim-${c.id}-reject`}
                      label="Reject"
                      variant="neutral"
                      size="md"
                      disabled={offline}
                      onPress={() => { decide.reset(); setReviewing({ id: c.id, mode: 'reject' }); }}
                      style={styles.flex}
                    />
                  </View>
                )}
              </MandiCard>
            );
          })}
        </View>
      )}

      {extensions.length > 0 && (
        <View style={styles.section} testID="invoice-extensions">
          <MandiSectionHeader title="Due date moved" />
          {extensions.map((e) => (
            <MandiCard key={e.id} compact testID={`invoice-extension-${e.id}`}>
              <MandiText variant="bodyEmphasis">
                {`${formatDay(e.oldDueDate) ?? e.oldDueDate} to ${formatDay(e.newDueDate) ?? e.newDueDate}`}
              </MandiText>
              <MandiText variant="caption" color={Colors.textSecondary}>{e.reason}</MandiText>
              <MandiText variant="caption" color={Colors.textTertiary}>{formatDay(e.createdAt) ?? ''}</MandiText>
            </MandiCard>
          ))}
        </View>
      )}

      {mayRecord && (
        <RecordPaymentSheet
          key={`record-${recordSession}`}
          visible={recordOpen && reviewed == null}
          onClose={() => setRecordOpen(false)}
          agreementId={invoice.agreementId}
          due={null}
          overdue={null}
          targets={[{ id: invoice.id, invoiceNumber: invoice.invoiceNumber, outstanding: invoice.outstanding }]}
          offline={offline}
          previewNonce={previewNonce}
          reviewableInvoiceIds={waiting.length > 0 ? [invoice.id] : []}
          onReviewClaim={() => {
            const first = waiting[0];
            if (first != null) { decide.reset(); setReviewing({ id: first.id, mode: 'review' }); }
          }}
        />
      )}
      {mayExtend && (
        <ExtendDueSheet
          key={`extend-${extendSession}`}
          visible={extendOpen}
          onClose={() => setExtendOpen(false)}
          invoice={{
            id: invoice.id, agreementId: invoice.agreementId, invoiceNumber: invoice.invoiceNumber, dueDate: invoice.dueDate,
          }}
          offline={offline}
          onExtended={(response) => {
            setExtendOpen(false);
            toast.show(`Due date moved to ${formatDay(response.extension.newDueDate) ?? response.extension.newDueDate}. The restaurant has been told.`, 'success');
          }}
        />
      )}
      <ClaimReviewSheet
        claim={reviewed}
        visible={reviewed != null}
        initialMode={reviewing?.mode ?? 'review'}
        onClose={closeReview}
        canAct={canCollect}
        offline={offline}
        pending={decide.pending}
        error={decide.error}
        onConfirm={(c, a) => { void confirmFor(c, a); }}
        onReject={(c, r) => { void rejectFor(c, r); }}
        onEdit={decide.reset}
      />
    </MandiScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { gap: Spacing.listGap },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.xs },
  actions: { gap: Spacing.sm },
  row: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  payment: { flexDirection: 'row', gap: Spacing.md, paddingVertical: Spacing.sm },
});
