import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import {
  acceptAgreement,
  fetchAgreement,
  fetchCreditSummary,
  fetchInvoices,
} from '@/services/credit';
import { CreditPosition } from '@/components/credit/CreditPosition';
import { CreditInvoiceRow } from '@/components/credit/CreditInvoiceRow';
import { CreditStickyPayBar } from '@/components/credit/CreditStickyPayBar';
import { PayFromWalletSheet } from '@/components/credit/PayFromWalletSheet';
import { canReportPayment, reportedLine } from '@/lib/credit/claims';
import { splitInvoices, type CreditInvoiceListItem } from '@/lib/credit/invoices';
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
import { CreditAgreementStatus, resolveStatus } from '@/models/status';
import { ApiError } from '@/lib/api/errors';
import { formatMoney } from '@/utils/money';
import { Colors, IconSize, Radius, Spacing, TouchTarget } from '@/theme';

const PAGE_SIZE = 50;
type InvoiceTab = 'open' | 'paid';

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
  const router = useRouter();
  const { outletId } = useOutlet();
  const { offline } = useNetworkStatus();
  const [tab, setTab] = useState<InvoiceTab>('open');
  const [shown, setShown] = useState(PAGE_SIZE);
  const [payOpen, setPayOpen] = useState(false);
  const queryClient = useQueryClient();
  const { accessToken } = useSession();

  const agreement = useQuery({
    queryKey: ['credit-agreement', agreementId],
    queryFn: () => fetchAgreement(accessToken as string, agreementId),
    enabled: Number.isFinite(agreementId) && accessToken != null,
  });

  const invoices = useQuery({
    // Outlet-scoped, so the pay sheet's invalidation of the outlet's credit keys refreshes it.
    queryKey: ['outlet', outletId, 'credit', 'agreement', agreementId, 'invoices'],
    queryFn: () => fetchInvoices(accessToken as string, agreementId),
    enabled: Number.isFinite(agreementId) && accessToken != null,
  });

  // Same key as the Credit overview, so it is usually already cached.
  const summary = useQuery({
    queryKey: ['outlet', outletId, 'credit'],
    queryFn: () => fetchCreditSummary(accessToken as string, outletId as number),
    enabled: outletId != null && accessToken != null,
  });
  const walletRepayEnabled = summary.data?.walletRepayEnabled === true;

  const split = useMemo(
    () => splitInvoices((invoices.data ?? []) as CreditInvoiceListItem[]),
    [invoices.data],
  );

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
  /**
   * Terms the supplier changed that this restaurant has not agreed to yet.
   *
   * <p><b>Two conditions, not one.</b> `latestRequest.status === 'MODIFIED'` is
   * a permanent fact — the supplier really did approve something other than
   * what was asked for, and accepting does not un-modify it. On its own it kept
   * the "Accept These Terms" card on screen forever, over a line that was
   * already Active with the full limit available to spend.
   *
   * <p>Whether anything is still owed is `canFund`, which is the server's
   * answer: an APPROVED agreement waiting on acceptance cannot fund, and an
   * ACTIVE one can. The supplier's side of this screen already reasons this way
   * — D-067, from the other direction.
   */
  const modified = data?.latestRequest?.status === 'MODIFIED' && data?.canFund === false;
  const pending = data?.status === 'REQUESTED';
  const rejected = data?.status === 'REJECTED';
  const status = data ? resolveStatus(CreditAgreementStatus, data.status) : null;

  /**
   * Approved, but nothing can be drawn on it yet.
   *
   * <p>Same rule as `modified`, applied to the panel: while `canFund` is false
   * there is no spendable balance, and "Available to spend ₹25,000.00" sat
   * directly under a card saying "Credit is not usable until you accept". One
   * of those two had to be wrong, and it was the number.
   */
  const awaitingAcceptance = data != null && !pending && !rejected
    && data.canFund === false && data.status !== 'SUSPENDED';

  return (
    <MandiScreen
      header={<MandiHeader title={data?.supplierName ?? 'Credit'} subtitle={data?.storeName ?? undefined} back />}
      onRefresh={() => {
        void agreement.refetch();
        void invoices.refetch();
      }}
      refreshing={agreement.isRefetching}
      footer={
        data != null && !pending && !rejected && !awaitingAcceptance ? (
          <CreditStickyPayBar
            due={data.due}
            disabled={offline}
            showPay={walletRepayEnabled}
            onPress={() => setPayOpen(true)}
            onClaim={!canReportPayment(data.reportableAmount) ? undefined : () => router.push({
              pathname: '/restaurant/credit/claim',
              params: { agreementId: String(agreementId) },
            })}
          />
        ) : undefined
      }
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
                label="Accept These Terms"
                size="md"
                loading={accept.isPending}
                onPress={() => accept.mutate()}
              />
            </MandiCard>
          )}

          {data.status === 'SUSPENDED' && (
            <View testID="credit-suspended-banner" accessibilityRole="alert">
            <MandiCard accentColor={Colors.danger}>
              <MandiText variant="bodyEmphasis">This credit line is suspended</MandiText>
              <MandiText variant="caption" color={Colors.textSecondary}>
                {suspensionText(data.suspensionReason)}
              </MandiText>
              {isOverdueSuspension(data.suspensionReason) && (
                <MandiText variant="caption" color={Colors.textSecondary}>
                  {"Paying what's overdue can restore it."}
                </MandiText>
              )}
            </MandiCard>
            </View>
          )}

          {/* What this line is, said once and in the same place whatever the
              state. The page had no status at all, so a request awaiting an
              answer and a live line differed only in their numbers. */}
          <View style={styles.statusRow}>
            <MandiText variant="caption" color={Colors.textSecondary} style={styles.flex}>
              {pending ? 'Waiting on this supplier'
                : rejected ? 'This supplier said no'
                  : awaitingAcceptance ? 'Waiting on you'
                    : 'Credit line'}
            </MandiText>
            <MandiStatusChip
              label={status?.label ?? ''}
              tone={status?.tone}
              size="sm"
            />
          </View>

          {/* A request is a question, not a credit line.
              <p>It had no limit, no period and nothing drawn, and the balance
              panel rendered all of that as "₹0.00 available of ₹0.00 approved"
              over "0 days" — which reads as a credit line worth nothing rather
              than as an answer nobody has given yet. The supplier's side
              already knew this; this is the same rule from the other end. */}
          {pending ? (
            <MandiCard>
              <MandiText variant="caption" color={Colors.textSecondary}>You asked for</MandiText>
              <MandiText variant="display">
                {formatMoney(data.latestRequest?.requestedLimit ?? '0')}
              </MandiText>
              <MandiText variant="caption" color={Colors.textSecondary}>
                payable in {data.latestRequest?.requestedPeriodDays ?? '—'} days
              </MandiText>
              {data.latestRequest?.purpose != null && (
                <MandiText variant="body" color={Colors.textSecondary} style={styles.spacedTop}>
                  {data.latestRequest.purpose}
                </MandiText>
              )}
              <MandiText variant="caption" color={Colors.textTertiary} style={styles.spacedTop}>
                {data.supplierName ?? 'The supplier'} decides the limit and the terms — we run
                the workflow and the ledger, and do not fund or guarantee credit.
              </MandiText>
            </MandiCard>
          ) : rejected ? (
            <MandiCard accentColor={Colors.danger}>
              <MandiText variant="bodyEmphasis">They turned this down</MandiText>
              <MandiText variant="caption" color={Colors.textSecondary}>
                {data.latestRequest?.responseNote
                  ?? 'They did not give a reason. You can ask again once things change.'}
              </MandiText>
            </MandiCard>
          ) : awaitingAcceptance ? (
            // The terms on offer, not a balance: nothing is spendable until
            // they are accepted, and the card above says so.
            <MandiCard>
              <MandiText variant="caption" color={Colors.textSecondary}>They approved</MandiText>
              <MandiText variant="display">{formatMoney(data.approvedLimit)}</MandiText>
              <MandiText variant="caption" color={Colors.textSecondary}>
                payable in {data.creditPeriodDays ?? '—'} days
              </MandiText>
            </MandiCard>
          ) : (
            <>
              <MandiCard>
                <MandiText variant="caption" color={Colors.textSecondary}>Owed</MandiText>
                <MandiText variant="display" testID="credit-owed">{formatMoney(data.due)}</MandiText>
                {Number(data.overdue) > 0 && (
                  <View style={styles.overdueRow} testID="credit-overdue" accessible accessibilityLabel={`${formatMoney(data.overdue)} overdue`}>
                    <Ionicons name="alert-circle" size={IconSize.sm} color={Colors.danger} />
                    <MandiText variant="bodyEmphasis" color={Colors.danger}>
                      {formatMoney(data.overdue)} overdue
                    </MandiText>
                  </View>
                )}
                {reportedLine(data.openClaimsAmount) != null && (
                  <MandiText variant="caption" color={Colors.textSecondary} testID="credit-reported">
                    {reportedLine(data.openClaimsAmount)}
                  </MandiText>
                )}
                {termsLine(data.creditPeriodDays, data.gracePeriodDays) != null && (
                  <MandiText variant="caption" color={Colors.textSecondary} testID="credit-terms-line">
                    {termsLine(data.creditPeriodDays, data.gracePeriodDays)}
                  </MandiText>
                )}
              </MandiCard>
              <CreditPosition
                approvedLimit={data.approvedLimit}
                reserved={data.reserved}
                utilized={data.utilized}
                available={data.available}
                due={data.due}
                overdue={data.overdue}
              />
            </>
          )}

          {!pending && !rejected && !awaitingAcceptance && (
            <View style={styles.section}>
              <MandiSectionHeader title="Invoices" />
              <View style={styles.segments} accessibilityRole="tablist">
                {([['open', 'Open'], ['paid', 'Paid']] as const).map(([key, label]) => (
                  <Pressable
                    key={key}
                    testID={`credit-tab-${key}`}
                    onPress={() => { setTab(key); setShown(PAGE_SIZE); }}
                    accessibilityRole="tab"
                    accessibilityLabel={label}
                    accessibilityState={{ selected: tab === key }}
                    style={[styles.segment, tab === key && styles.segmentOn]}
                  >
                    <MandiText
                      variant="bodyEmphasis"
                      color={tab === key ? Colors.textInverse : Colors.textSecondary}
                    >
                      {label}
                    </MandiText>
                  </Pressable>
                ))}
              </View>
              {invoices.isPending ? (
                <MandiSkeletonList count={2} />
              ) : invoices.error ? (
                <MandiErrorState message="Couldn't load the invoices." onRetry={() => invoices.refetch()} />
              ) : (
                (() => {
                  const list = tab === 'open' ? split.open : split.paid;
                  if (list.length === 0) {
                    return (
                      <MandiText variant="caption" color={Colors.textTertiary} testID="credit-invoices-empty">
                        {tab === 'open' ? 'No open invoices' : 'No paid invoices yet'}
                      </MandiText>
                    );
                  }
                  return (
                    <>
                      {list.slice(0, shown).map((invoice) => (
                        <CreditInvoiceRow
                          key={invoice.id}
                          invoice={invoice}
                          onPress={() => router.push(`/restaurant/credit/invoice/${invoice.id}` as never)}
                        />
                      ))}
                      {list.length > shown && (
                        <MandiButton
                          label="Show more"
                          variant="secondary"
                          size="md"
                          testID="credit-show-more"
                          onPress={() => setShown((n) => n + PAGE_SIZE)}
                        />
                      )}
                    </>
                  );
                })()
              )}
            </View>
          )}

          {!pending && !rejected && !awaitingAcceptance
            && (data.maxSingleOrderCredit != null || data.termsVersion != null) && (
            <MandiCard>
              {data.maxSingleOrderCredit && (
                <Row label="Per-order cap" value={formatMoney(data.maxSingleOrderCredit)} />
              )}
              {data.termsVersion != null && (
                <Row label="Terms version" value={`v${data.termsVersion}`} />
              )}
            </MandiCard>
          )}

          {!pending && !rejected && (
            <View style={styles.section}>
              <Pressable
                testID="credit-statement-row"
                onPress={() => router.push({
                  pathname: '/restaurant/credit/statement',
                  params: { agreementId: String(agreementId) },
                })}
                accessibilityRole="button"
                accessibilityLabel="Statement"
                accessibilityHint="Every order and repayment, with what you owed after each"
                style={styles.statementRow}
              >
                <MandiText variant="bodyEmphasis" style={styles.flex}>Statement</MandiText>
                <Ionicons name="chevron-forward" size={IconSize.sm} color={Colors.textTertiary} />
              </Pressable>
              <MandiText variant="caption" color={Colors.textSecondary}>
                Every order and repayment, with what you owed after each.
              </MandiText>
            </View>
          )}
          {data.due != null && (
            <PayFromWalletSheet
              visible={payOpen}
              onClose={() => setPayOpen(false)}
              agreementId={agreementId}
              supplierName={data.supplierName ?? 'the supplier'}
              due={data.due}
              overdue={data.overdue}
              onPaid={() => setPayOpen(false)}
            />
          )}
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

const OVERDUE_REASON = 'Overdue balance';

function isOverdueSuspension(reason: string | null): boolean {
  return reason != null && reason.startsWith(OVERDUE_REASON);
}

function suspensionText(reason: string | null): string {
  if (reason == null || reason.trim() === '') {
    return 'The supplier has paused it. Existing invoices still stand.';
  }
  return isOverdueSuspension(reason) ? `Paused: ${reason}` : `Suspended by supplier: ${reason}`;
}

function termsLine(period: number | null, grace: number | null): string | null {
  if (period == null) return null;
  const days = `${period} ${period === 1 ? 'day' : 'days'}`;
  return grace != null && grace > 0 ? `${days} + ${grace} ${grace === 1 ? 'day' : 'days'} grace` : days;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  overdueRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  segments: {
    flexDirection: 'row',
    padding: Spacing.xs,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceSunken,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
  },
  segmentOn: { backgroundColor: Colors.primary },
  statementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: TouchTarget.min,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  spacedTop: { marginTop: Spacing.xs },
  section: { gap: Spacing.listGap },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
});
