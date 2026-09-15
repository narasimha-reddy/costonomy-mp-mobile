import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { acceptAgreement, fetchAgreement, fetchInvoices, fetchLedger } from '@/services/credit';
import { CreditPosition } from '@/components/credit/CreditPosition';
import {
  MandiButton,
  MandiCard,
  MandiErrorState,
  MandiHeader,
  MandiScreen,
  MandiSectionHeader,
  MandiSkeletonList,
  MandiStatusChip,
  MandiText,
  useToast,
} from '@/components/common';
import { ApiError } from '@/lib/api/errors';
import { formatMoney } from '@/utils/money';
import { Colors, Spacing } from '@/theme';

/**
 * One supplier's credit line. Doc 05 §19.
 *
 * <p>The ledger is shown because a credit balance nobody can explain is a credit
 * balance nobody trusts: every reservation, drawdown, release and repayment is
 * listed with the balance it left behind.
 *
 * <p><b>Modified terms need acceptance.</b> Doc 04 §13 — a supplier changing the
 * limit or period does not take effect until the restaurant agrees, and this is
 * the only place that agreement can be given.
 */
export default function CreditAgreementScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const agreementId = Number(id);
  const toast = useToast();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();

  const agreement = useQuery({
    queryKey: ['credit-agreement', agreementId],
    queryFn: () => fetchAgreement(accessToken as string, agreementId),
    enabled: Number.isFinite(agreementId) && accessToken != null,
  });

  const ledger = useQuery({
    queryKey: ['credit-agreement', agreementId, 'ledger'],
    queryFn: () => fetchLedger(accessToken as string, agreementId),
    enabled: Number.isFinite(agreementId) && accessToken != null,
  });

  const invoices = useQuery({
    queryKey: ['credit-agreement', agreementId, 'invoices'],
    queryFn: () => fetchInvoices(accessToken as string, agreementId),
    enabled: Number.isFinite(agreementId) && accessToken != null,
  });

  const accept = useMutation({
    mutationFn: () => acceptAgreement(accessToken as string, agreementId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['credit-agreement', agreementId] });
      toast.show('Terms accepted', 'success');
    },
    onError: (caught) =>
      toast.show(caught instanceof ApiError ? caught.message : 'Could not accept.', 'error'),
  });

  const data = agreement.data;
  const modified = data?.latestRequest?.status === 'MODIFIED';

  return (
    <MandiScreen
      header={<MandiHeader title={data?.supplierName ?? 'Credit'} subtitle={data?.storeName ?? undefined} back />}
      onRefresh={() => {
        void agreement.refetch();
        void ledger.refetch();
        void invoices.refetch();
      }}
      refreshing={agreement.isRefetching}
    >
      {agreement.isPending ? (
        <MandiSkeletonList count={3} />
      ) : agreement.error || data == null ? (
        <MandiErrorState message="Couldn't load this credit line." onRetry={() => agreement.refetch()} />
      ) : (
        <>
          {modified && (
            <MandiCard accentColor={Colors.warning}>
              <MandiText variant="bodyEmphasis">The supplier changed the terms</MandiText>
              <MandiText variant="caption" color={Colors.textSecondary}>
                {data.latestRequest?.responseNote
                  ?? 'They approved a different limit or period from the one you asked for.'}
              </MandiText>
              <MandiText variant="caption" color={Colors.textTertiary}>
                Approved {formatMoney(data.approvedLimit)} over {data.creditPeriodDays} days.
                Credit is not usable until you accept.
              </MandiText>
              <MandiButton
                label="Accept these terms"
                size="md"
                loading={accept.isPending}
                onPress={() => accept.mutate()}
              />
            </MandiCard>
          )}

          {data.status === 'SUSPENDED' && (
            <MandiCard accentColor={Colors.danger}>
              <MandiText variant="bodyEmphasis">This credit line is suspended</MandiText>
              <MandiText variant="caption" color={Colors.textSecondary}>
                {data.suspensionReason ?? 'The supplier has paused it. Existing invoices still stand.'}
              </MandiText>
            </MandiCard>
          )}

          <CreditPosition
            approvedLimit={data.approvedLimit}
            reserved={data.reserved}
            utilized={data.utilized}
            available={data.available}
            due={data.due}
            overdue={data.overdue}
          />

          <MandiCard>
            <Row label="Payment period" value={`${data.creditPeriodDays ?? '—'} days`} />
            <Row label="Grace period" value={`${data.gracePeriodDays ?? 0} days`} />
            {data.maxSingleOrderCredit && (
              <Row label="Per-order cap" value={formatMoney(data.maxSingleOrderCredit)} />
            )}
            {data.termsVersion != null && (
              <Row label="Terms version" value={`v${data.termsVersion}`} />
            )}
          </MandiCard>

          <View style={styles.section}>
            <MandiSectionHeader title="Invoices" />
            {(invoices.data ?? []).length === 0 ? (
              <MandiText variant="caption" color={Colors.textTertiary}>
                Nothing invoiced on this line yet.
              </MandiText>
            ) : (
              (invoices.data ?? []).map((invoice) => (
                <MandiCard key={invoice.id}>
                  <View style={styles.row}>
                    <MandiText variant="bodyEmphasis">{invoice.invoiceNumber}</MandiText>
                    <MandiStatusChip
                      label={invoice.status.replace(/_/g, ' ').toLowerCase()}
                      tone={
                        invoice.status === 'PAID' ? 'success'
                          : invoice.status === 'OVERDUE' ? 'danger' : 'pending'
                      }
                      size="sm"
                    />
                  </View>
                  <View style={styles.row}>
                    <MandiText variant="caption" color={Colors.textSecondary}>
                      {formatMoney(invoice.outstanding)} outstanding
                    </MandiText>
                    <MandiText variant="caption" color={Colors.textTertiary}>
                      due {invoice.dueDate ?? '—'}
                    </MandiText>
                  </View>
                </MandiCard>
              ))
            )}
          </View>

          <View style={styles.section}>
            <MandiSectionHeader
              title="Activity"
              subtitle="Every movement, with the balance it left"
            />
            {(ledger.data ?? []).length === 0 ? (
              <MandiText variant="caption" color={Colors.textTertiary}>
                No activity yet.
              </MandiText>
            ) : (
              (ledger.data ?? []).slice(0, 20).map((entry) => (
                <MandiCard key={entry.id} compact>
                  <View style={styles.row}>
                    <MandiText variant="body">
                      {entry.description ?? humanise(entry.type)}
                    </MandiText>
                    <MandiText variant="bodyEmphasis">{formatMoney(entry.amount)}</MandiText>
                  </View>
                  <MandiText variant="caption" color={Colors.textTertiary}>
                    {formatMoney(entry.availableAfter)} available after
                  </MandiText>
                </MandiCard>
              ))
            )}
          </View>
        </>
      )}
    </MandiScreen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <MandiText variant="body" color={Colors.textSecondary}>{label}</MandiText>
      <MandiText variant="body">{value}</MandiText>
    </View>
  );
}

function humanise(value: string): string {
  const spaced = value.replace(/_/g, ' ').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const styles = StyleSheet.create({
  section: { gap: Spacing.listGap },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
});
