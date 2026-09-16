import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import {
  fetchAgreement,
  fetchInvoices,
  fetchLedger,
  modifyCredit,
  reinstateCredit,
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
import { formatMoney } from '@/utils/money';
import { track } from '@/analytics';
import { Colors, Radius, Spacing } from '@/theme';

const SCREEN = 'SUP-CREDIT-02';
const PERIODS = [7, 15, 30, 45, 60];

type Mode = 'view' | 'edit' | 'suspend';

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
  const limitValue = limit ?? (data ? String(Number(data.approvedLimit)) : '');
  const daysValue = days ?? data?.creditPeriodDays ?? 30;

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

  return (
    <MandiScreen
      header={
        <MandiHeader
          title={data?.outletName ?? 'Credit line'}
          subtitle={data ? `${data.creditPeriodDays ?? '—'} day terms` : undefined}
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
            <MandiText variant="bodyEmphasis" style={styles.flex}>
              {data.outletName ?? `Outlet ${data.outletId}`}
            </MandiText>
            <MandiStatusChip
              label={data.status.toLowerCase()}
              tone={data.status === 'ACTIVE' ? 'success' : 'warning'}
              size="sm"
            />
          </View>

          <CreditPosition
            approvedLimit={data.approvedLimit}
            reserved={data.reserved}
            utilized={data.utilized}
            available={data.available}
            due={data.due}
            overdue={data.overdue}
          />

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

          {mode === 'view' && (
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

    if (mode === 'edit') {
      return (
        <MandiStickyBar>
          <MandiButton
            label="Save new terms"
            size="lg"
            disabled={reason.trim().length < 3 || Number(limitValue) <= 0 || cutsBelowExposure}
            loading={modify.isPending}
            onPress={() => modify.mutate()}
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
