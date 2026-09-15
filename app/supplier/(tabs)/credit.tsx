import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { approveCredit, fetchStoreAgreements, rejectCredit, suspendCredit } from '@/services/credit';
import type { CreditAgreement } from '@/models/credit';
import { StoreSelector } from '@/components/supplier/StoreSelector';
import { CreditPosition } from '@/components/credit/CreditPosition';
import {
  MandiButton,
  MandiCard,
  MandiEmptyState,
  MandiErrorState,
  MandiFormField,
  MandiHeader,
  MandiScreen,
  MandiSkeletonList,
  MandiStatusChip,
  MandiText,
  useToast,
} from '@/components/common';
import { ApiError } from '@/lib/api/errors';
import { formatMoney } from '@/utils/money';
import { track } from '@/analytics';
import { Colors, Radius, Spacing, TouchTarget } from '@/theme';

const SCREEN = 'SUP-CREDIT-01';

type Tab = 'requests' | 'portfolio';

/**
 * SUP-CREDIT-01 and -02. Doc 05 §31–§32.
 *
 * <p>Requests to answer, and the portfolio of what is already extended.
 *
 * <p><b>Approving a different limit is a modification, and the screen says so.</b>
 * Doc 04 §13: it does not take effect until the restaurant accepts it. A supplier
 * who thinks they have trimmed a limit, when in fact they have sent the
 * restaurant a question, will be surprised by the exposure that follows.
 */
export default function SupplierCreditScreen() {
  const { accessToken } = useSession();
  const { storeId } = useStore();
  const [tab, setTab] = useState<Tab>('requests');

  const query = useQuery({
    queryKey: ['store', storeId, 'credit-agreements'],
    queryFn: () => fetchStoreAgreements(accessToken as string, storeId as number),
    enabled: storeId != null && accessToken != null,
  });

  const all = useMemo(() => query.data ?? [], [query.data]);
  const pending = useMemo(
    () => all.filter((a) => a.status === 'REQUESTED'),
    [all],
  );
  const portfolio = useMemo(
    () => all.filter((a) => a.status !== 'REQUESTED' && a.status !== 'REJECTED'),
    [all],
  );

  const exposure = useMemo(() => {
    // Rendered from the server's per-agreement figures. Summing `utilized`
    // across agreements is presentation, not a financial calculation — no
    // agreement's own numbers are derived here.
    const total = (key: 'approvedLimit' | 'utilized' | 'overdue') =>
      portfolio.reduce((sum, a) => sum + Number(a[key] ?? 0), 0);
    return {
      limit: total('approvedLimit'),
      utilized: total('utilized'),
      overdue: total('overdue'),
    };
  }, [portfolio]);

  const list = tab === 'requests' ? pending : portfolio;

  return (
    <MandiScreen
      header={<Header tab={tab} onTab={setTab} pendingCount={pending.length} />}
      onRefresh={() => query.refetch()}
      refreshing={query.isRefetching}
    >
      {tab === 'portfolio' && portfolio.length > 0 && (
        <MandiCard>
          <MandiText variant="bodyEmphasis">Your exposure</MandiText>
          <View style={styles.exposure}>
            <Figure label="Extended" value={formatMoney(String(exposure.limit), true)} />
            <Figure label="Drawn" value={formatMoney(String(exposure.utilized), true)} />
            <Figure
              label="Overdue"
              value={formatMoney(String(exposure.overdue), true)}
              tone={exposure.overdue > 0 ? Colors.danger : undefined}
            />
          </View>
        </MandiCard>
      )}

      {query.isPending ? (
        <MandiSkeletonList count={3} />
      ) : query.error ? (
        <MandiErrorState message="Couldn't load credit." onRetry={() => query.refetch()} />
      ) : list.length === 0 ? (
        <MandiEmptyState
          icon="card-outline"
          title={tab === 'requests' ? 'No requests waiting' : 'Nothing extended yet'}
          description={
            tab === 'requests'
              ? 'Restaurants asking you for credit will appear here.'
              : 'Credit lines you approve show here with what each one owes.'
          }
        />
      ) : (
        list.map((agreement) =>
          tab === 'requests'
            ? <RequestCard key={agreement.id} agreement={agreement} storeId={storeId} />
            : <PortfolioCard key={agreement.id} agreement={agreement} storeId={storeId} />,
        )
      )}
    </MandiScreen>
  );
}

function RequestCard({ agreement, storeId }: { agreement: CreditAgreement; storeId: number | null }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();
  const [limit, setLimit] = useState(String(agreement.latestRequest?.requestedLimit ?? ''));
  const [editing, setEditing] = useState(false);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['store', storeId, 'credit-agreements'] });

  const approve = useMutation({
    mutationFn: (modified: boolean) =>
      approveCredit(accessToken as string, agreement.id, modified ? { approvedLimit: limit } : {}),
    onSuccess: (_data, modified) => {
      track('credit_approved', { screen: SCREEN, entityId: agreement.id }, { modified });
      void invalidate();
      toast.show(modified ? 'Sent back with new terms' : 'Credit approved', 'success');
    },
    onError: (caught) =>
      toast.show(caught instanceof ApiError ? caught.message : 'Could not approve.', 'error'),
  });

  const reject = useMutation({
    mutationFn: () => rejectCredit(accessToken as string, agreement.id, 'Not extending credit here'),
    onSuccess: () => {
      void invalidate();
      toast.show('Request declined', 'info');
    },
    onError: (caught) =>
      toast.show(caught instanceof ApiError ? caught.message : 'Could not decline.', 'error'),
  });

  const request = agreement.latestRequest;

  return (
    <MandiCard outlined accentColor={Colors.primary}>
      <MandiText variant="bodyEmphasis">{agreement.outletName ?? `Outlet ${agreement.outletId}`}</MandiText>
      <MandiText variant="caption" color={Colors.textSecondary}>
        Asking for {formatMoney(request?.requestedLimit)} over {request?.requestedPeriodDays} days
      </MandiText>
      {request?.purpose && (
        <MandiText variant="caption" color={Colors.textTertiary}>{request.purpose}</MandiText>
      )}

      {editing && (
        <>
          <MandiFormField
            label="Approve a different limit"
            value={limit}
            onChangeText={(text) => setLimit(text.replace(/[^\d.]/g, ''))}
            keyboardType="decimal-pad"
            hint="A different limit is a modification — the restaurant has to accept it before the credit works."
          />
          <MandiButton
            label="Send modified terms"
            size="md"
            loading={approve.isPending}
            onPress={() => approve.mutate(true)}
          />
        </>
      )}

      <View style={styles.actions}>
        <MandiButton
          label="Approve as asked"
          size="md"
          loading={approve.isPending && !editing}
          onPress={() => approve.mutate(false)}
          style={styles.flex}
        />
        <MandiButton
          label={editing ? 'Cancel' : 'Change limit'}
          variant="secondary"
          size="md"
          onPress={() => setEditing(!editing)}
          style={styles.flex}
        />
      </View>
      <MandiButton
        label="Decline"
        variant="tertiary"
        size="md"
        loading={reject.isPending}
        onPress={() => reject.mutate()}
      />
    </MandiCard>
  );
}

function PortfolioCard({ agreement, storeId }: { agreement: CreditAgreement; storeId: number | null }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();

  const suspend = useMutation({
    mutationFn: () => suspendCredit(accessToken as string, agreement.id, 'Overdue balance'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['store', storeId, 'credit-agreements'] });
      toast.show('Credit suspended', 'info');
    },
    onError: (caught) =>
      toast.show(caught instanceof ApiError ? caught.message : 'Could not suspend.', 'error'),
  });

  return (
    <MandiCard>
      <View style={styles.row}>
        <MandiText variant="bodyEmphasis">
          {agreement.outletName ?? `Outlet ${agreement.outletId}`}
        </MandiText>
        <MandiStatusChip
          label={agreement.status.toLowerCase()}
          tone={agreement.status === 'ACTIVE' ? 'success' : 'warning'}
          size="sm"
        />
      </View>

      <CreditPosition
        approvedLimit={agreement.approvedLimit}
        reserved={agreement.reserved}
        utilized={agreement.utilized}
        available={agreement.available}
        due={agreement.due}
        overdue={agreement.overdue}
      />

      {agreement.status === 'ACTIVE' && (
        <MandiButton
          label="Suspend this line"
          variant="tertiary"
          size="md"
          loading={suspend.isPending}
          onPress={() => suspend.mutate()}
        />
      )}
    </MandiCard>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.figure}>
      <MandiText variant="caption" color={Colors.textSecondary}>{label}</MandiText>
      <MandiText variant="bodyEmphasis" color={tone}>{value}</MandiText>
    </View>
  );
}

function Header({ tab, onTab, pendingCount }: {
  tab: Tab; onTab: (tab: Tab) => void; pendingCount: number;
}) {
  const tabs: { key: Tab; label: string }[] = [
    { key: 'requests', label: pendingCount > 0 ? `Requests (${pendingCount})` : 'Requests' },
    { key: 'portfolio', label: 'Portfolio' },
  ];
  return (
    <View style={styles.header}>
      <MandiHeader title="Credit" right={<StoreSelector />} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {tabs.map((option) => {
          const active = option.key === tab;
          return (
            <Pressable
              key={option.key}
              onPress={() => onTab(option.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={[styles.tab, active && styles.tabActive]}
            >
              <MandiText
                variant="captionEmphasis"
                color={active ? Colors.textInverse : Colors.textSecondary}
              >
                {option.label}
              </MandiText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { gap: Spacing.sm, paddingBottom: Spacing.sm },
  tabs: { paddingHorizontal: Spacing.screenHorizontal, gap: Spacing.sm },
  tab: {
    paddingHorizontal: Spacing.lg,
    justifyContent: 'center',
    minHeight: TouchTarget.min - 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceSunken,
  },
  tabActive: { backgroundColor: Colors.primary },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  exposure: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm, marginTop: Spacing.sm },
  figure: { gap: Spacing.xs },
});
