import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import {
  approveCredit,
  fetchAgreement,
  fetchInvoices,
  fetchLedger,
  modifyCredit,
  reinstateCredit,
  rejectCredit,
  suspendCredit,
} from '@/services/credit';
import { CreditPosition } from '@/components/credit/CreditPosition';
import {
  MandiButton,
  MandiCard,
  MandiErrorState,
  MandiFormField,
  MandiHeader,
  MandiScreen,
  MandiSectionHeader,
  MandiSkeletonList,
  MandiStatusChip,
  MandiStickyBar,
  MandiText,
  useToast,
} from '@/components/common';
import { ApiError } from '@/lib/api/errors';
import { formatDistance } from '@/utils/orders';
import { formatMoney } from '@/utils/money';
import { track } from '@/analytics';
import { Colors, Radius, Spacing } from '@/theme';

const SCREEN = 'SUP-CREDIT-02';
const PERIODS = [7, 15, 30, 45, 60];

type Mode = 'view' | 'edit' | 'suspend' | 'counter' | 'decline';

/**
 * One credit line, from the supplier's side. Doc 05 §32.
 *
 * <p><b>Every change needs a reason, because the restaurant sees it.</b> Doc 01
 * §18 makes each adjustment auditable, and an unexplained limit cut is precisely
 * what that requirement exists to stop — so the reason is a required field here
 * rather than a note the screen quietly omits.
 *
 * <p><b>A cut does not claw anything back.</b> Commitments already made stand: the
 * server refuses a limit below reserved + utilized (D-024) and says what the floor
 * is. The screen shows current exposure while editing so that refusal is
 * predictable rather than a surprise.
 *
 * <p>Suspending stops new orders and leaves existing debt and reservations
 * untouched — which is the honest description, and what the screen says.
 */
export default function SupplierCreditAgreementScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const agreementId = Number(id);
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();
  const { storeId } = useStore();

  const [mode, setMode] = useState<Mode>('view');
  const [limit, setLimit] = useState<string | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [reason, setReason] = useState('');

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

  const data = agreement.data;
  const asked = data?.latestRequest;
  const limitValue = limit
    ?? (asked != null && data?.status === 'REQUESTED'
      ? String(Number(asked.requestedLimit))
      : data ? String(Number(data.approvedLimit)) : '');
  const daysValue = days
    ?? (asked != null && data?.status === 'REQUESTED'
      ? asked.requestedPeriodDays
      : data?.creditPeriodDays)
    ?? 30;

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['credit-agreement', agreementId] });
    void queryClient.invalidateQueries({ queryKey: ['store', storeId, 'credit-agreements'] });
  }

  function onFailure(caught: unknown, fallback: string) {
    // The server's message names the floor on a refused cut (D-024) and the
    // reason on a refused transition. Replacing it with "failed" would leave a
    // supplier guessing at a number only the server knows.
    toast.show(caught instanceof ApiError ? caught.message : fallback, 'error');
  }

  const modify = useMutation({
    mutationFn: () =>
      modifyCredit(accessToken as string, agreementId, {
        approvedLimit: limitValue,
        creditPeriodDays: daysValue,
        reason: reason.trim(),
      }),
    onSuccess: () => {
      track('credit_modified', { screen: SCREEN, entityId: agreementId });
      invalidate();
      setMode('view');
      setReason('');
      toast.show('Terms updated — the restaurant has been told', 'success');
    },
    onError: (caught) => onFailure(caught, 'Could not change the terms.'),
  });

  const suspend = useMutation({
    mutationFn: () => suspendCredit(accessToken as string, agreementId, reason.trim()),
    onSuccess: () => {
      track('credit_suspended', { screen: SCREEN, entityId: agreementId });
      invalidate();
      setMode('view');
      setReason('');
      toast.show('Credit suspended', 'info');
    },
    onError: (caught) => onFailure(caught, 'Could not suspend this line.'),
  });

  const approve = useMutation({
    // Values make it a modification; no values approves what was asked for.
    // Doc 04 §13: a modification is explicit and versioned, and the credit does
    // not work until the restaurant accepts it — so the copy says so rather than
    // letting a supplier believe they have simply trimmed a number.
    mutationFn: (modified: boolean) =>
      approveCredit(accessToken as string, agreementId,
        modified
          ? { approvedLimit: limitValue, creditPeriodDays: daysValue, note: reason.trim() || undefined }
          : {}),
    onSuccess: (_data, modified) => {
      track('credit_approved', { screen: SCREEN, entityId: agreementId }, { modified });
      invalidate();
      setMode('view');
      setReason('');
      toast.show(
        modified ? 'Sent back with your terms — they have to accept' : 'Credit approved',
        'success',
      );
    },
    onError: (caught) => onFailure(caught, 'Could not approve this request.'),
  });

  const decline = useMutation({
    mutationFn: () => rejectCredit(accessToken as string, agreementId, reason.trim()),
    onSuccess: () => {
      track('credit_rejected', { screen: SCREEN, entityId: agreementId });
      invalidate();
      toast.show('Request declined', 'info');
      router.replace('/supplier/credit');
    },
    onError: (caught) => onFailure(caught, 'Could not decline this request.'),
  });

  const reinstate = useMutation({
    mutationFn: () => reinstateCredit(accessToken as string, agreementId),
    onSuccess: () => {
      track('credit_reinstated', { screen: SCREEN, entityId: agreementId });
      invalidate();
      toast.show('Credit reinstated', 'success');
    },
    onError: (caught) => onFailure(caught, 'Could not reinstate this line.'),
  });

  const exposure = data ? Number(data.reserved) + Number(data.utilized) : 0;
  const cutsBelowExposure = Number(limitValue) < exposure;

  // A REQUESTED agreement is a question, not a credit line: it has no position
  // to show and a different set of answers.
  /**
   * Why the edit cannot be saved yet, or null when it can.
   *
   * <p>A greyed-out button with no explanation is a dead end: the reason is
   * always knowable here, so it gets said. Returning the sentence rather than a
   * boolean keeps the check and its explanation from drifting apart.
   */
  const editBlockedBy: string | null = (() => {
    if (Number(limitValue) <= 0) return 'Enter a credit limit above zero.';
    if (cutsBelowExposure) return 'That limit is below what they have already committed.';
    if (reason.trim().length < 3) return 'Add a reason — the restaurant sees it.';
    return null;
  })();

  const pending = data?.status === 'REQUESTED';
  const request = data?.latestRequest;

  /**
   * Approved, but not yet usable.
   *
   * <p>`canFund` is the server's answer and the only one worth trusting. An
   * APPROVED agreement whose terms were modified sits here until the restaurant
   * accepts — doc 04 §13 — so showing "₹50,000 available to spend" would tell a
   * supplier they have extended credit that nobody can draw on. The restaurant's
   * side learned this as D-067; this is the same rule from the other direction.
   */
  const awaitingAcceptance = data != null && !pending && !data.canFund
    && data.status !== 'SUSPENDED' && data.status !== 'REJECTED';

  return (
    <MandiScreen
      header={
        <MandiHeader
          title={data?.outletName ?? 'Credit line'}
          subtitle={
            // Who and where, then the terms — the same order a card states them
            // in, so tapping through does not rearrange the facts. A request has
            // no agreed terms yet, so "0 day terms" would describe a line that
            // does not exist.
            data == null ? undefined : [
              data.restaurantName,
              data.outletLocality,
              formatDistance(data.distanceKm),
              data.status === 'REQUESTED' ? 'Credit request' : `${data.creditPeriodDays ?? '—'} day terms`,
            ].filter(Boolean).join(' · ')
          }
          back
          onBack={() => (mode === 'view' ? router.back() : setMode('view'))}
        />
      }
      footer={renderFooter()}
    >
      {agreement.isPending ? (
        <MandiSkeletonList count={3} />
      ) : agreement.error || data == null ? (
        <MandiErrorState
          message="Couldn't load this credit line."
          onRetry={() => agreement.refetch()}
        />
      ) : (
        <>
          {data.status === 'SUSPENDED' && (
            <MandiCard accentColor={Colors.warning}>
              <MandiText variant="bodyEmphasis">This line is suspended</MandiText>
              <MandiText variant="caption" color={Colors.textSecondary}>
                {data.suspensionReason ?? 'No new orders can draw on it.'} Existing debt and
                reservations are untouched.
              </MandiText>
            </MandiCard>
          )}

          <View style={styles.row}>
            <MandiText variant="caption" color={Colors.textSecondary} style={styles.flex}>
              {pending ? 'Waiting on your answer' : 'Credit line'}
            </MandiText>
            <MandiStatusChip
              label={data.status.toLowerCase()}
              tone={data.status === 'ACTIVE' ? 'success' : 'warning'}
              size="sm"
            />
          </View>

          {awaitingAcceptance && (
            <MandiCard accentColor={Colors.info}>
              <MandiText variant="bodyEmphasis">Waiting for them to accept</MandiText>
              <MandiText variant="caption" color={Colors.textSecondary}>
                You approved {formatMoney(data.approvedLimit)} over {data.creditPeriodDays} days.
                Because those terms differ from what they asked for, nothing can be drawn
                until the restaurant accepts them.
              </MandiText>
            </MandiCard>
          )}

          {pending ? (
            <MandiCard>
              <MandiText variant="caption" color={Colors.textSecondary}>They are asking for</MandiText>
              <MandiText variant="display">{formatMoney(request?.requestedLimit)}</MandiText>
              <MandiText variant="caption" color={Colors.textSecondary}>
                payable in {request?.requestedPeriodDays ?? '—'} days
              </MandiText>
              {request?.purpose != null && (
                <MandiText variant="body" color={Colors.textSecondary} style={styles.spacedTop}>
                  {request.purpose}
                </MandiText>
              )}
              {request?.note != null && (
                <MandiText variant="caption" color={Colors.textTertiary}>
                  &ldquo;{request.note}&rdquo;
                </MandiText>
              )}
            </MandiCard>
          ) : awaitingAcceptance ? (
            <MandiCard>
              <Row label="Limit you approved" value={formatMoney(data.approvedLimit)} />
              <Row label="Payment period" value={`${data.creditPeriodDays ?? '—'} days`} />
              <Row label="Terms version" value={`v${data.termsVersion ?? 1}`} />
            </MandiCard>
          ) : (
            <CreditPosition
              approvedLimit={data.approvedLimit}
              reserved={data.reserved}
              utilized={data.utilized}
              available={data.available}
              due={data.due}
              overdue={data.overdue}
            />
          )}

          {mode === 'edit' && (
            <MandiCard>
              <MandiText variant="bodyEmphasis">Change the terms</MandiText>

              <MandiFormField
                label="Credit limit"
                value={limitValue}
                onChangeText={(text) => setLimit(text.replace(/[^\d.]/g, ''))}
                keyboardType="decimal-pad"
                required
                error={cutsBelowExposure
                  ? `They have ${formatMoney(String(exposure))} committed. A limit below that is refused — suspend the line instead if you need to stop new orders.`
                  : undefined}
                hint="A cut never claws back what is already committed."
              />

              <View>
                <MandiText variant="label">Payment period</MandiText>
                <View style={styles.chips}>
                  {PERIODS.map((option) => {
                    const active = option === daysValue;
                    return (
                      <Pressable
                        key={option}
                        onPress={() => setDays(option)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <MandiText
                          variant="captionEmphasis"
                          color={active ? Colors.primary : Colors.textSecondary}
                        >
                          {option} days
                        </MandiText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <MandiFormField
                label="Why are you changing this?"
                value={reason}
                onChangeText={setReason}
                placeholder="Good payment history"
                required
                hint="The restaurant sees this. Every adjustment is on the record."
              />
            </MandiCard>
          )}

          {mode === 'counter' && (
            <MandiCard>
              <MandiText variant="bodyEmphasis">Approve on your terms</MandiText>
              <MandiText variant="caption" color={Colors.textSecondary}>
                Anything you change makes this a modification — the restaurant has to accept
                it before the credit works.
              </MandiText>

              <MandiFormField
                label="Credit limit"
                value={limitValue}
                onChangeText={(text) => setLimit(text.replace(/[^\d.]/g, ''))}
                keyboardType="decimal-pad"
                required
                hint={`They asked for ${formatMoney(request?.requestedLimit)}.`}
              />

              <View>
                <MandiText variant="label">Payment period</MandiText>
                <View style={styles.chips}>
                  {PERIODS.map((option) => {
                    const active = option === daysValue;
                    return (
                      <Pressable
                        key={option}
                        onPress={() => setDays(option)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <MandiText
                          variant="captionEmphasis"
                          color={active ? Colors.primary : Colors.textSecondary}
                        >
                          {option} days
                        </MandiText>
                      </Pressable>
                    );
                  })}
                </View>
                <MandiText variant="caption" color={Colors.textTertiary}>
                  They asked for {request?.requestedPeriodDays ?? '—'} days.
                </MandiText>
              </View>

              <MandiFormField
                label="Note (optional)"
                value={reason}
                onChangeText={setReason}
                placeholder="Happy to start here and review in three months"
                hint="The restaurant sees this alongside your terms."
              />
            </MandiCard>
          )}

          {mode === 'decline' && (
            <MandiCard>
              <MandiText variant="bodyEmphasis">Decline this request</MandiText>
              <MandiText variant="caption" color={Colors.textSecondary}>
                They can ask again later. Nothing else about your relationship changes.
              </MandiText>
              <MandiFormField
                label="Reason"
                value={reason}
                onChangeText={setReason}
                placeholder="Not extending credit to new accounts yet"
                required
                hint="The restaurant sees this."
              />
            </MandiCard>
          )}

          {mode === 'suspend' && (
            <MandiCard accentColor={Colors.warning}>
              <MandiText variant="bodyEmphasis">Suspend this line</MandiText>
              <MandiText variant="caption" color={Colors.textSecondary}>
                No new order can draw on it. What they already owe, and anything reserved
                against orders in flight, is unaffected.
              </MandiText>
              <MandiFormField
                label="Reason"
                value={reason}
                onChangeText={setReason}
                placeholder="Overdue balance"
                required
                hint="The restaurant sees this."
              />
            </MandiCard>
          )}

          {mode === 'view' && !pending && !awaitingAcceptance && (
            <>
              <MandiCard>
                <Row label="Approved limit" value={formatMoney(data.approvedLimit)} />
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
                    <MandiCard key={invoice.id} compact>
                      <View style={styles.row}>
                        <MandiText variant="body">{invoice.invoiceNumber}</MandiText>
                        <MandiText variant="bodyEmphasis">
                          {formatMoney(invoice.outstanding)}
                        </MandiText>
                      </View>
                      <MandiText variant="caption" color={Colors.textTertiary}>
                        {invoice.status.replace(/_/g, ' ').toLowerCase()} · due {invoice.dueDate ?? '—'}
                      </MandiText>
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
                )}
              </View>
            </>
          )}
        </>
      )}
    </MandiScreen>
  );

  function renderFooter() {
    if (data == null) return undefined;

    if (pending) {
      if (mode === 'counter') {
        return (
          <MandiStickyBar>
            <View style={styles.confirmRow}>
              <MandiText variant="caption" color={Colors.textSecondary}>
                Approving
              </MandiText>
              <MandiText variant="bodyEmphasis">
                {Number(limitValue) > 0 ? formatMoney(limitValue) : '—'} · {daysValue} days
              </MandiText>
            </View>
            <MandiButton
              label="Approve at these terms"
              size="lg"
              disabled={Number(limitValue) <= 0}
              loading={approve.isPending}
              onPress={() => approve.mutate(true)}
            />
            {Number(limitValue) <= 0 && (
              <MandiText variant="caption" color={Colors.textTertiary} center>
                Enter a limit above zero to approve.
              </MandiText>
            )}
            <MandiButton label="Back" variant="neutral" size="md" onPress={() => setMode('view')} />
          </MandiStickyBar>
        );
      }

      if (mode === 'decline') {
        return (
          <MandiStickyBar>
            <MandiButton
              label="Decline this request"
              size="lg"
              variant="destructive"
              disabled={reason.trim().length < 3}
              loading={decline.isPending}
              onPress={() => decline.mutate()}
            />
            <MandiButton label="Back" variant="neutral" size="md" onPress={() => setMode('view')} />
          </MandiStickyBar>
        );
      }

      return (
        <MandiStickyBar>
          <MandiButton
            label="Approve as asked"
            size="lg"
            loading={approve.isPending}
            onPress={() => approve.mutate(false)}
          />
          <View style={styles.actions}>
            <MandiButton
              label="Approve on my terms"
              variant="secondary"
              size="md"
              onPress={() => setMode('counter')}
              style={styles.flex}
            />
            <MandiButton
              label="Decline"
              variant="neutral"
              size="md"
              onPress={() => setMode('decline')}
              style={styles.flex}
            />
          </View>
        </MandiStickyBar>
      );
    }

    if (mode === 'edit') {
      return (
        <MandiStickyBar>
          <MandiButton
            label="Save new terms"
            size="lg"
            disabled={editBlockedBy != null}
            loading={modify.isPending}
            onPress={() => modify.mutate()}
          />
          {editBlockedBy != null && (
            <MandiText variant="caption" color={Colors.textTertiary} center>
              {editBlockedBy}
            </MandiText>
          )}
          <MandiButton
            label="Cancel"
            variant="neutral"
            size="md"
            onPress={() => setMode('view')}
          />
        </MandiStickyBar>
      );
    }

    if (mode === 'suspend') {
      return (
        <MandiStickyBar>
          <MandiButton
            label="Suspend this line"
            size="lg"
            variant="destructive"
            disabled={reason.trim().length < 3}
            loading={suspend.isPending}
            onPress={() => suspend.mutate()}
          />
          <MandiButton
            label="Cancel"
            variant="neutral"
            size="md"
            onPress={() => setMode('view')}
          />
        </MandiStickyBar>
      );
    }

    return (
      <MandiStickyBar>
        <View style={styles.actions}>
          <MandiButton
            label="Edit terms"
            variant="secondary"
            size="md"
            icon="create-outline"
            onPress={() => setMode('edit')}
            style={styles.flex}
          />
          {data.status === 'SUSPENDED' ? (
            <MandiButton
              label="Reinstate"
              size="md"
              icon="play-outline"
              loading={reinstate.isPending}
              onPress={() => reinstate.mutate()}
              style={styles.flex}
            />
          ) : (
            <MandiButton
              label="Suspend"
              variant="neutral"
              size="md"
              icon="pause-outline"
              onPress={() => setMode('suspend')}
              style={styles.flex}
            />
          )}
        </View>
      </MandiStickyBar>
    );
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.totalsRow}>
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
  actions: { flexDirection: 'row', gap: Spacing.sm },
  spacedTop: { marginTop: Spacing.sm },
  confirmRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.xs },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  chipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
});
