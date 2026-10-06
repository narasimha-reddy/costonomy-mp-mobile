import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import {
  approveCredit,
  closeCredit,
  fetchAgreement,
  fetchAgreementClaims,
  fetchAgreementPayments,
  fetchInvoices,
  fetchLedger,
  modifyCredit,
  reinstateCredit,
  rejectCredit,
  suspendCredit,
} from '@/services/credit';
import { CreditInvoiceRow } from '@/components/credit/CreditInvoiceRow';
import { ClaimReviewSheet } from '@/components/credit/ClaimReviewSheet';
import { LineReasonSheet } from '@/components/credit/LineReasonSheet';
import { RecordPaymentSheet } from '@/components/credit/RecordPaymentSheet';
import { SupplierLineActions, SupplierMoreSheet, type MoreEntry } from '@/components/credit/SupplierLineActions';
import { SupplierLineHero } from '@/components/credit/SupplierLineHero';
import { SupplierPaymentRow } from '@/components/credit/SupplierPaymentRow';
import { TermsEditorSheet } from '@/components/credit/TermsEditorSheet';
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
  MandiStickyBar,
  MandiText,
  useToast,
} from '@/components/common';
import { useDecideClaim } from '@/hooks/useDecideClaim';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { usePermissions } from '@/hooks/usePermissions';
import { mayDecideClaims } from '@/lib/credit/claimInbox';
import { claimMethodLabel } from '@/lib/credit/claims';
import { splitInvoices, type CreditInvoiceListItem } from '@/lib/credit/invoices';
import {
  approveInputFrom, lineBanner, modifyInputFrom, reinstateNote, type TermsDraft,
} from '@/lib/credit/supplierLine';
import {
  agreementClaimsKey, agreementKey, agreementPaymentsKey, receivablesRootKey, supplierWriteKeys,
} from '@/lib/queryKeys';
import { serverNow } from '@/lib/server-clock';
import { CreditAgreementStatus, resolveStatus } from '@/models/status';
import type { ClaimResponse } from '@/models/credit';
import { ApiError } from '@/lib/api/errors';
import { formatDay, relative } from '@/utils/dateRange';
import { formatMoney } from '@/utils/money';
import { track } from '@/analytics';
import { Colors, IconSize, Spacing, TouchTarget } from '@/theme';

const SCREEN = 'SUP-CREDIT-02';
const PAYMENTS_PAGE = 20;

type Sheet = null | 'more' | 'terms' | 'approveTerms' | 'suspend' | 'reinstate' | 'decline' | 'close';

/** The next step when a close is refused because something is still owed or on hold. */
const CLOSE_NEXT_STEP = 'Suspend it to stop new orders, close it once it is paid.';

/** Statuses where the line carries a position (what is owed, held, available). */
const HAS_POSITION = new Set(['ACTIVE', 'SUSPENDED', 'CLOSED']);

/**
 * One credit line, from the supplier's side. Doc 05 §32, plan S2, S10.
 *
 * <p><b>Every figure is the server's.</b> The hero, the banners and the lists show what the
 * API sent; the app adds nothing up. What the API does not send (who suspended the line, the
 * auto-pause threshold, the lowest allowed limit) is shown only when it arrives.
 *
 * <p><b>Every change needs a reason, because the restaurant sees it.</b> Terms, suspend and
 * reinstate each go through a sheet that asks for one. A cut does not claw anything back:
 * the server refuses a limit below what is drawn or on hold and says what the floor is; its
 * message is shown as sent.
 *
 * <p><b>Hiding is a courtesy.</b> People without CREDIT_MODIFY (or CREDIT_COLLECT for
 * payments) see the line but not the buttons; the server checks again.
 *
 * <p>Extension points: `SupplierLineActions` takes `onRecord` and `onRemind`, and the More
 * menu lists only the entries passed in, so later screens wire in without reshaping this one.
 */
export default function SupplierCreditAgreementScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const agreementId = Number(id);
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();
  const { storeId, store } = useStore();
  const { offline } = useNetworkStatus();
  const { canForStore } = usePermissions();
  const canModify = store != null && canForStore('CREDIT_MODIFY', store);
  const canCollect = mayDecideClaims(canForStore, store);
  const decide = useDecideClaim();

  const [sheet, setSheet] = useState<Sheet>(null);
  const [settledOpen, setSettledOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [review, setReview] = useState<{ id: number; mode: 'review' | 'reject' } | null>(null);
  const busy = useRef(false);
  // Recording a payment: one sheet per opening (`recordSession` is its key); `picked` are the
  // invoices ticked for "Record for selected".
  const [recordOpen, setRecordOpen] = useState(false);
  const [recordSession, setRecordSession] = useState(0);
  const [recordTargets, setRecordTargets] = useState<number[]>([]);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [picked, setPicked] = useState<number[]>([]);
  const enabled = Number.isFinite(agreementId) && accessToken != null;

  const agreement = useQuery({
    queryKey: agreementKey(agreementId),
    queryFn: () => fetchAgreement(accessToken as string, agreementId),
    enabled,
  });
  const data = agreement.data;
  const hasPosition = data != null && HAS_POSITION.has(data.status);

  const invoices = useQuery({
    queryKey: [...agreementKey(agreementId), 'invoices'],
    queryFn: () => fetchInvoices(accessToken as string, agreementId),
    enabled: enabled && hasPosition,
  });
  const claims = useQuery({
    queryKey: agreementClaimsKey(agreementId),
    queryFn: () => fetchAgreementClaims(accessToken as string, agreementId, 'SUBMITTED'),
    enabled: enabled && hasPosition,
  });
  const payments = useInfiniteQuery({
    queryKey: agreementPaymentsKey(agreementId),
    queryFn: ({ pageParam }) =>
      fetchAgreementPayments(accessToken as string, agreementId, { page: pageParam, size: PAYMENTS_PAGE }),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.hasNext ? all.length : undefined),
    enabled: enabled && hasPosition,
  });
  const ledger = useQuery({
    queryKey: [...agreementKey(agreementId), 'ledger'],
    queryFn: () => fetchLedger(accessToken as string, agreementId),
    enabled: enabled && hasPosition && activityOpen,
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: agreementKey(agreementId) });
    void queryClient.invalidateQueries({ queryKey: ['store', storeId, 'credit-agreements'] });
    void queryClient.invalidateQueries({ queryKey: receivablesRootKey(storeId) });
  }
  function refetchAll() {
    void agreement.refetch();
    void invoices.refetch();
    void claims.refetch();
    void payments.refetch();
    if (activityOpen) void ledger.refetch();
  }

  /** The server's own words win: they name the floor on a refused cut and the reason on a refused transition. */
  function messageOf(caught: unknown, fallback: string): string {
    return caught instanceof ApiError && caught.message !== '' ? caught.message : fallback;
  }
  /** A refused transition means the screen was out of date: show what is true now. */
  function onFailure(caught: unknown) {
    if (caught instanceof ApiError && (caught.status === 409 || caught.status === 404)) refresh();
  }
  /** One write at a time: a double tap in the same instant reaches the server once. */
  function once<T>(run: () => Promise<T>): Promise<T | undefined> {
    if (busy.current) return Promise.resolve(undefined);
    busy.current = true;
    return run().finally(() => { busy.current = false; });
  }

  const close = useMutation({
    mutationFn: (reason: string) => closeCredit(accessToken as string, agreementId, reason),
    onSuccess: () => {
      track('credit_closed', { screen: SCREEN, entityId: agreementId });
      void Promise.all(supplierWriteKeys(storeId, agreementId).map((queryKey) =>
        queryClient.invalidateQueries({ queryKey: [...queryKey] })));
      setSheet(null);
      toast.show('Credit line closed', 'info');
    },
    onError: onFailure,
  });

  const modify = useMutation({
    mutationFn: (draft: TermsDraft) =>
      modifyCredit(accessToken as string, agreementId, modifyInputFrom(draft)),
    onSuccess: () => {
      track('credit_modified', { screen: SCREEN, entityId: agreementId });
      refresh();
      setSheet(null);
      toast.show('Terms updated. The restaurant has been told.', 'success');
    },
    onError: onFailure,
  });

  const approve = useMutation({
    // No values approves what was asked for; values make it a modification the
    // restaurant has to accept (doc 04 §13), so the copy says so.
    mutationFn: (draft: TermsDraft | null) =>
      approveCredit(accessToken as string, agreementId, draft == null ? {} : approveInputFrom(draft)),
    onSuccess: (_data, draft) => {
      track('credit_approved', { screen: SCREEN, entityId: agreementId }, { modified: draft != null });
      refresh();
      setSheet(null);
      toast.show(
        draft != null ? 'Sent back with your terms. They have to accept.' : 'Credit approved',
        'success',
      );
    },
    onError: onFailure,
  });

  const suspend = useMutation({
    mutationFn: (reason: string) => suspendCredit(accessToken as string, agreementId, reason),
    onSuccess: () => {
      track('credit_suspended', { screen: SCREEN, entityId: agreementId });
      refresh();
      setSheet(null);
      toast.show('Credit suspended', 'info');
    },
    onError: onFailure,
  });

  const reinstate = useMutation({
    mutationFn: (reason: string) => reinstateCredit(accessToken as string, agreementId, reason),
    onSuccess: () => {
      track('credit_reinstated', { screen: SCREEN, entityId: agreementId });
      refresh();
      setSheet(null);
      toast.show('Credit reinstated', 'success');
    },
    onError: onFailure,
  });

  const decline = useMutation({
    mutationFn: (reason: string) => rejectCredit(accessToken as string, agreementId, reason),
    onSuccess: () => {
      track('credit_rejected', { screen: SCREEN, entityId: agreementId });
      refresh();
      setSheet(null);
      toast.show('Request declined', 'info');
      router.replace('/supplier/credit');
    },
    onError: onFailure,
  });

  function openSheet(next: Sheet) {
    modify.reset(); approve.reset(); suspend.reset(); reinstate.reset(); decline.reset(); close.reset();
    setSheet(next);
  }
  function closeSheet() { setSheet(null); }

  /** The server's refusal as sent; when it is about what is owed or held, the next step is added. */
  function closeError(caught: unknown): string | null {
    if (caught == null) return null;
    const text = messageOf(caught, 'Could not close this line.');
    return caught instanceof ApiError && caught.code === 'INVALID_STATE_TRANSITION'
      ? `${text} ${CLOSE_NEXT_STEP}` : text;
  }

  const errorOf = (m: { error: unknown }, fallback: string) =>
    m.error == null ? null : messageOf(m.error, fallback);

  // The claims waiting on this line; looked up by id so a refetch that drops one closes the sheet.
  const waiting = claims.data ?? [];
  const reviewed = review == null ? null : waiting.find((c) => c.id === review.id) ?? null;
  function closeReview() {
    setReview(null);
    decide.reset();
    // Back to the receipt form it was opened from; what the claim did changes the preview.
    if (recordOpen) setPreviewNonce((n) => n + 1);
  }

  async function confirmClaimFor(claim: ClaimResponse, amount: string | null) {
    const response = await decide.confirm(claim, amount);
    if (response != null) {
      closeReview();
      toast.show(`Confirmed. ${formatMoney(response.confirmedAmount ?? response.amount)} recorded from ${claim.restaurantName ?? 'the restaurant'}.`, 'success');
    }
  }
  async function rejectClaimFor(claim: ClaimResponse, reason: string) {
    const response = await decide.reject(claim, reason);
    if (response != null) {
      closeReview();
      toast.show('Done. The restaurant is told you did not receive it.', 'success');
    }
  }

  const split = splitInvoices<CreditInvoiceListItem>(invoices.data ?? []);
  const paymentItems = (payments.data?.pages ?? []).flatMap((p) => p.items);
  const openInvoices = split.open;
  // Ticks only count while the invoice is still open: a refetch that settles one drops it.
  const chosen = openInvoices.filter((i) => picked.includes(i.id));
  const mayRecord = canCollect && data != null && (data.status === 'ACTIVE' || data.status === 'SUSPENDED');
  function openRecord(ids: number[]) {
    setRecordTargets(ids);
    setRecordSession((n) => n + 1);
    setPreviewNonce(0);
    setRecordOpen(true);
  }
  function closeRecord() {
    setRecordOpen(false);
    setPicked([]);
  }
  const recordTargetRows = openInvoices
    .filter((i) => recordTargets.includes(i.id))
    .map((i) => ({ id: i.id, invoiceNumber: i.invoiceNumber, outstanding: i.outstanding }));
  const notFound = agreement.error instanceof ApiError && agreement.error.status === 404;

  const pending = data?.status === 'REQUESTED';
  const sentAgo = data?.latestRequest?.respondedAt != null
    ? relative(new Date(data.latestRequest.respondedAt), new Date(serverNow()))
    : null;
  const banner = data == null ? null : lineBanner(data, sentAgo);
  const chip = data == null ? null : resolveStatus(CreditAgreementStatus, data.status);

  const moreEntries: MoreEntry[] = [];
  if (data != null && canModify) {
    if (data.status === 'ACTIVE' || data.status === 'SUSPENDED' || data.status === 'APPROVED') {
      moreEntries.push({ key: 'terms', label: 'Edit terms', hint: 'Limit, period, grace', onPress: () => openSheet('terms') });
    }
    if (data.status === 'ACTIVE') {
      moreEntries.push({ key: 'suspend', label: 'Suspend', hint: 'Stop new orders', onPress: () => openSheet('suspend') });
    }
    if (data.status === 'SUSPENDED') {
      moreEntries.push({ key: 'reinstate', label: 'Reinstate', hint: 'Allow new orders again', onPress: () => openSheet('reinstate') });
    }
    if (data.status === 'ACTIVE' || data.status === 'SUSPENDED') {
      moreEntries.push({
        key: 'close', label: 'Close line', hint: 'End this line for good', destructive: true,
        onPress: () => openSheet('close'),
      });
    }
    // 'Write off' joins this list when its sheet exists.
  }

  return (
    <MandiScreen
      header={
        <MandiHeader
          title={data?.restaurantName ?? data?.outletName ?? 'Credit line'}
          subtitle={data == null ? undefined
            : [data.outletName, data.outletLocality].filter(Boolean).join(' · ') || undefined}
          back
          onBack={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/supplier/credit' as never);
          }}
        />
      }
      onRefresh={refetchAll}
      refreshing={agreement.isRefetching}
      footer={renderFooter()}
    >
      <MandiOfflineBanner visible={offline} />
      {agreement.isPending ? (
        <MandiSkeletonList count={3} />
      ) : notFound ? (
        <MandiEmptyState
          icon="lock-closed-outline"
          title="This credit line is not available to you"
          description="It may belong to another store. Go back to your receivables to pick one."
        />
      ) : agreement.error || data == null ? (
        <MandiErrorState message="Couldn't load this credit line." onRetry={() => agreement.refetch()} />
      ) : (
        <>
          <View style={styles.row}>
            <MandiText variant="caption" color={Colors.textSecondary} style={styles.flex}>
              {pending ? 'Waiting on your answer' : 'Credit line'}
            </MandiText>
            {chip != null && <MandiStatusChip label={chip.label} tone={chip.tone} size="sm" />}
          </View>

          {banner != null && (
            <MandiCard accentColor={banner.tone === 'warning' ? Colors.warning : Colors.info} testID="line-banner">
              <MandiText variant="bodyEmphasis">{banner.title}</MandiText>
              {banner.body != null && (
                <MandiText variant="caption" color={Colors.textSecondary}>{banner.body}</MandiText>
              )}
            </MandiCard>
          )}

          {pending && (
            <MandiCard>
              <MandiText variant="caption" color={Colors.textSecondary}>They are asking for</MandiText>
              <MandiText variant="display">{formatMoney(data.latestRequest?.requestedLimit)}</MandiText>
              <MandiText variant="caption" color={Colors.textSecondary}>
                payable in {data.latestRequest?.requestedPeriodDays ?? '—'} days
              </MandiText>
              {data.latestRequest?.purpose != null && (
                <MandiText variant="body" color={Colors.textSecondary} style={styles.spacedTop}>
                  {data.latestRequest.purpose}
                </MandiText>
              )}
              {data.latestRequest?.note != null && (
                <MandiText variant="caption" color={Colors.textTertiary}>
                  &ldquo;{data.latestRequest.note}&rdquo;
                </MandiText>
              )}
            </MandiCard>
          )}

          {hasPosition && <SupplierLineHero agreement={data} />}

          {hasPosition && (
            <SupplierLineActions
              canCollect={canCollect}
              offline={offline}
              onRecord={mayRecord ? () => openRecord([]) : undefined}
              onStatement={() => router.push({
                pathname: '/supplier/credit/statement', params: { agreementId: String(agreementId) },
              } as never)}
              onMore={moreEntries.length > 0 ? () => openSheet('more') : undefined}
            />
          )}

          {!pending && data.status !== 'REJECTED' && (
            <MandiCard testID="terms-summary">
              <Row label="Approved limit" value={formatMoney(data.approvedLimit)} />
              <Row label="Payment period" value={`${data.creditPeriodDays ?? '—'} days`} />
              <Row label="Grace period" value={`${data.gracePeriodDays ?? 0} days`} />
              {data.maxSingleOrderCredit != null && (
                <Row label="Per-order cap" value={formatMoney(data.maxSingleOrderCredit)} />
              )}
              {data.maxOverdueAmount != null && (
                <Row label="Pauses when overdue passes" value={formatMoney(data.maxOverdueAmount)} />
              )}
              {data.termsVersion != null && <Row label="Terms version" value={`v${data.termsVersion}`} />}
            </MandiCard>
          )}

          {data.status === 'APPROVED' && canModify && (
            <MandiButton
              testID="edit-terms"
              label="Edit Terms"
              variant="secondary"
              size="md"
              icon="create-outline"
              onPress={() => openSheet('terms')}
            />
          )}

          {hasPosition && waiting.length > 0 && (
            <View style={styles.section} testID="claims-section">
              <MandiSectionHeader title="Payments to confirm" count={waiting.length} />
              {waiting.map((claim) => (
                <MandiCard key={claim.id} compact testID={`detail-claim-${claim.id}`}>
                  <MandiText variant="bodyEmphasis">{`${claim.invoiceNumber} · ${formatMoney(claim.amount)}`}</MandiText>
                  <MandiText variant="caption" color={Colors.textSecondary}>
                    {[claimMethodLabel(claim.method), claim.reference].filter((p) => p != null && p !== '').join(' · ')}
                    {` · paid ${formatDay(claim.paidOn) ?? claim.paidOn}`}
                  </MandiText>
                  <MandiText variant="caption" color={Colors.warning}>
                    {`Sent ${relative(new Date(claim.createdAt), new Date(serverNow()))}`}
                  </MandiText>
                  {canCollect && (
                    <View style={styles.actions}>
                      <MandiButton
                        testID={`detail-claim-${claim.id}-confirm`}
                        label="Confirm"
                        size="md"
                        disabled={offline}
                        onPress={() => { decide.reset(); setReview({ id: claim.id, mode: 'review' }); }}
                        style={styles.flex}
                      />
                      <MandiButton
                        testID={`detail-claim-${claim.id}-reject`}
                        label="Reject"
                        variant="neutral"
                        size="md"
                        disabled={offline}
                        onPress={() => { decide.reset(); setReview({ id: claim.id, mode: 'reject' }); }}
                        style={styles.flex}
                      />
                    </View>
                  )}
                </MandiCard>
              ))}
            </View>
          )}

          {hasPosition && (
            <View style={styles.section}>
              <MandiSectionHeader title="Open invoices" />
              {invoices.isPending ? (
                <MandiSkeletonList count={2} />
              ) : invoices.error ? (
                <MandiErrorState message="Couldn't load the invoices." onRetry={() => invoices.refetch()} />
              ) : (invoices.data ?? []).length === 0 ? (
                <MandiText variant="caption" color={Colors.textTertiary}>
                  Nothing invoiced on this line yet.
                </MandiText>
              ) : split.open.length === 0 ? (
                <MandiText variant="caption" color={Colors.textTertiary}>Nothing is open. They are all paid up.</MandiText>
              ) : (
                <>
                  {split.open.map((invoice) => {
                    const ticked = picked.includes(invoice.id);
                    return (
                      <View key={invoice.id} style={styles.pickRow}>
                        {mayRecord && (
                          <Pressable
                            testID={`pick-invoice-${invoice.id}`}
                            onPress={() => setPicked((p) => (p.includes(invoice.id)
                              ? p.filter((x) => x !== invoice.id) : [...p, invoice.id]))}
                            accessibilityRole="checkbox"
                            accessibilityLabel={`Select ${invoice.invoiceNumber} to record a payment`}
                            accessibilityState={{ checked: ticked }}
                            style={styles.check}
                          >
                            <Ionicons
                              name={ticked ? 'checkbox' : 'square-outline'}
                              size={IconSize.lg}
                              color={ticked ? Colors.primary : Colors.textTertiary}
                            />
                          </Pressable>
                        )}
                        <View style={styles.flex}>
                          <CreditInvoiceRow
                            invoice={invoice}
                            selected={mayRecord ? ticked : undefined}
                            onPress={() => router.push(`/supplier/credit/invoice/${invoice.id}` as never)}
                          />
                        </View>
                      </View>
                    );
                  })}
                  {mayRecord && chosen.length > 0 && (
                    <MandiButton
                      testID="record-for-selected"
                      label={`Record for ${chosen.length} selected`}
                      icon="cash-outline"
                      size="md"
                      disabled={offline}
                      onPress={() => openRecord(chosen.map((i) => i.id))}
                    />
                  )}
                </>
              )}
            </View>
          )}

          {hasPosition && (
            <View style={styles.section}>
              <MandiSectionHeader title="Recent payments" />
              {payments.isPending ? (
                <MandiSkeletonList count={2} />
              ) : payments.error ? (
                <MandiErrorState message="Couldn't load the payments." onRetry={() => payments.refetch()} />
              ) : paymentItems.length === 0 ? (
                <MandiText variant="caption" color={Colors.textTertiary}>No payments yet.</MandiText>
              ) : (
                <MandiCard>
                  {paymentItems.map((p, i) => (
                    <SupplierPaymentRow key={p.id} payment={p} last={i === paymentItems.length - 1} />
                  ))}
                </MandiCard>
              )}
              {payments.hasNextPage && (
                <MandiButton
                  testID="payments-more"
                  label="Show more payments"
                  variant="neutral"
                  size="md"
                  loading={payments.isFetchingNextPage}
                  onPress={() => { void payments.fetchNextPage(); }}
                />
              )}
            </View>
          )}

          {hasPosition && split.paid.length > 0 && (
            <View style={styles.section}>
              <Fold
                testID="settled-toggle"
                title={`Settled invoices (${split.paid.length})`}
                open={settledOpen}
                onPress={() => setSettledOpen((v) => !v)}
              />
              {settledOpen && split.paid.map((invoice) => <CreditInvoiceRow key={invoice.id} invoice={invoice} />)}
            </View>
          )}

          {hasPosition && (
            <View style={styles.section}>
              <Fold
                testID="activity-toggle"
                title="Activity"
                open={activityOpen}
                onPress={() => setActivityOpen((v) => !v)}
              />
              {activityOpen && (
                ledger.isPending ? (
                  <MandiSkeletonList count={2} />
                ) : ledger.error ? (
                  <MandiErrorState message="Couldn't load the activity." onRetry={() => ledger.refetch()} />
                ) : (ledger.data ?? []).length === 0 ? (
                  <MandiText variant="caption" color={Colors.textTertiary}>No activity yet.</MandiText>
                ) : (
                  (ledger.data ?? []).slice(0, 20).map((entry) => (
                    <MandiCard key={entry.id} compact>
                      <View style={styles.row}>
                        <MandiText variant="body" style={styles.flex}>
                          {entry.description ?? humanise(entry.type)}
                        </MandiText>
                        <MandiText variant="bodyEmphasis">{formatMoney(entry.amount)}</MandiText>
                      </View>
                      <MandiText variant="caption" color={Colors.textTertiary}>
                        {formatMoney(entry.availableAfter)} available after
                      </MandiText>
                    </MandiCard>
                  ))
                )
              )}
            </View>
          )}

          {mayRecord && (
            <RecordPaymentSheet
              key={recordSession}
              visible={recordOpen && review == null}
              onClose={closeRecord}
              agreementId={agreementId}
              due={data.due}
              overdue={data.overdue}
              targets={recordTargetRows}
              offline={offline}
              previewNonce={previewNonce}
              reviewableInvoiceIds={waiting.map((c) => c.invoiceId)}
              onReviewClaim={(invoiceId) => {
                const target = waiting.find((c) => c.invoiceId === invoiceId);
                if (target != null) { decide.reset(); setReview({ id: target.id, mode: 'review' }); }
              }}
            />
          )}

          <SupplierMoreSheet visible={sheet === 'more'} onClose={closeSheet} entries={moreEntries} />

          {canModify && (
            <>
              <TermsEditorSheet
                visible={sheet === 'terms'}
                onClose={closeSheet}
                agreement={data}
                mode="modify"
                pending={modify.isPending}
                error={errorOf(modify, 'Could not change the terms.')}
                offline={offline}
                onSubmit={(draft) => { void once(() => modify.mutateAsync(draft).catch(() => undefined)); }}
              />
              <TermsEditorSheet
                visible={sheet === 'approveTerms'}
                onClose={closeSheet}
                agreement={data}
                mode="approve"
                pending={approve.isPending}
                error={errorOf(approve, 'Could not approve this request.')}
                offline={offline}
                onSubmit={(draft) => { void once(() => approve.mutateAsync(draft).catch(() => undefined)); }}
              />
              <LineReasonSheet
                testID="suspend-sheet"
                visible={sheet === 'suspend'}
                onClose={closeSheet}
                title="Suspend this line"
                intro="No new order can draw on it. What they already owe, and anything held for orders in progress, is unaffected."
                reasonLabel="Reason"
                placeholder="Overdue balance"
                confirmLabel="Suspend This Line"
                destructive
                pending={suspend.isPending}
                error={errorOf(suspend, 'Could not suspend this line.')}
                offline={offline}
                onSubmit={(reason) => { void once(() => suspend.mutateAsync(reason).catch(() => undefined)); }}
              />
              <LineReasonSheet
                testID="reinstate-sheet"
                visible={sheet === 'reinstate'}
                onClose={closeSheet}
                title="Reinstate this line"
                intro="New orders can draw on it again, within the limit."
                note={reinstateNote(data)}
                reasonLabel="Reason"
                placeholder="They paid what was overdue"
                confirmLabel="Reinstate This Line"
                pending={reinstate.isPending}
                error={errorOf(reinstate, 'Could not reinstate this line.')}
                offline={offline}
                onSubmit={(reason) => { void once(() => reinstate.mutateAsync(reason).catch(() => undefined)); }}
              />
              <LineReasonSheet
                testID="close-sheet"
                visible={sheet === 'close'}
                onClose={closeSheet}
                title="Close this line"
                intro="No new order can use it and it cannot be reopened. They can ask you for credit again later."
                reasonLabel="Reason"
                placeholder="Relationship ended"
                confirmLabel="Close This Line"
                destructive
                pending={close.isPending}
                error={closeError(close.error)}
                offline={offline}
                onSubmit={(reason) => { void once(() => close.mutateAsync(reason).catch(() => undefined)); }}
              />
              <LineReasonSheet
                testID="decline-sheet"
                visible={sheet === 'decline'}
                onClose={closeSheet}
                title="Decline this request"
                intro="They can ask again later. Nothing else about your relationship changes."
                reasonLabel="Reason"
                placeholder="Not extending credit to new accounts yet"
                confirmLabel="Decline This Request"
                destructive
                pending={decline.isPending}
                error={errorOf(decline, 'Could not decline this request.')}
                offline={offline}
                onSubmit={(reason) => { void once(() => decline.mutateAsync(reason).catch(() => undefined)); }}
              />
            </>
          )}

          <ClaimReviewSheet
            claim={reviewed}
            visible={reviewed != null}
            initialMode={review?.mode ?? 'review'}
            onClose={closeReview}
            canAct={canCollect}
            offline={offline}
            pending={decide.pending}
            error={decide.error}
            onConfirm={(c, a) => { void confirmClaimFor(c, a); }}
            onReject={(c, r) => { void rejectClaimFor(c, r); }}
            onEdit={decide.reset}
          />
        </>
      )}
    </MandiScreen>
  );

  function renderFooter() {
    if (data == null || !pending || !canModify) return undefined;
    return (
      <MandiStickyBar>
        <MandiButton
          label="Approve As Asked"
          size="lg"
          disabled={offline}
          loading={approve.isPending}
          onPress={() => { void once(() => approve.mutateAsync(null).catch(() => undefined)); }}
        />
        {approve.error != null && sheet == null && (
          <MandiText variant="caption" color={Colors.danger} center>
            {messageOf(approve.error, 'Could not approve this request.')}
          </MandiText>
        )}
        <View style={styles.actions}>
          <MandiButton
            label="Approve On My Terms"
            variant="secondary"
            size="md"
            onPress={() => openSheet('approveTerms')}
            style={styles.flex}
          />
          <MandiButton
            label="Decline"
            variant="neutral"
            size="md"
            onPress={() => openSheet('decline')}
            style={styles.flex}
          />
        </View>
      </MandiStickyBar>
    );
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.totalsRow}>
      <MandiText variant="body" color={Colors.textSecondary} style={styles.flex}>{label}</MandiText>
      <MandiText variant="body">{value}</MandiText>
    </View>
  );
}

/** A section header that folds: tap to open or close. */
function Fold({ title, open, onPress, testID }: { title: string; open: boolean; onPress: () => void; testID: string }) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ expanded: open }}
      style={styles.fold}
    >
      <MandiText variant="bodyEmphasis" style={styles.flex}>{title}</MandiText>
      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={IconSize.sm} color={Colors.textTertiary} />
    </Pressable>
  );
}

function humanise(value: string): string {
  const spaced = value.replace(/_/g, ' ').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { gap: Spacing.listGap },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  totalsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  check: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  spacedTop: { marginTop: Spacing.sm },
  fold: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: TouchTarget.min + 4,
  },
});
