import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { approveCredit, fetchStoreAgreements } from '@/services/credit';
import type { CreditAgreement } from '@/models/credit';
import { SupplierHeader } from '@/components/supplier/SupplierHeader';
import { CreditPosition } from '@/components/credit/CreditPosition';
import {
  MandiButton,
  MandiCard,
  MandiEmptyState,
  MandiErrorState,
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
            ? <RequestCard key={agreement.id} agreement={agreement} />
            : <PortfolioCard key={agreement.id} agreement={agreement} />,
        )
      )}
    </MandiScreen>
  );
}

function RequestCard({ agreement }: { agreement: CreditAgreement }) {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();
  const { storeId } = useStore();
  const request = agreement.latestRequest;

  const approve = useMutation({
    // No arguments approves exactly what was asked for. Anything else is a
    // modification the restaurant has to accept, which is a decision worth a
    // screen rather than a text box on a list.
    mutationFn: () => approveCredit(accessToken as string, agreement.id, {}),
    onSuccess: () => {
      track('credit_approved', { screen: SCREEN, entityId: agreement.id }, { modified: false });
      void queryClient.invalidateQueries({ queryKey: ['store', storeId, 'credit-agreements'] });
      toast.show('Credit approved', 'success');
    },
    onError: (caught) =>
      toast.show(caught instanceof ApiError ? caught.message : 'Could not approve.', 'error'),
  });

  return (
    <MandiCard outlined accentColor={Colors.primary}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <MandiText variant="bodyEmphasis">
            {agreement.outletName ?? `Outlet ${agreement.outletId}`}
          </MandiText>
          {request?.purpose != null && (
            <MandiText variant="caption" color={Colors.textSecondary}>
              {request.purpose}
            </MandiText>
          )}
        </View>
        <MandiStatusChip label="new request" tone="pending" size="sm" />
      </View>

      <View style={styles.asked}>
        <Asked label="Limit" value={formatMoney(request?.requestedLimit)} />
        <Asked label="Period" value={`${request?.requestedPeriodDays ?? '—'} days`} />
      </View>

      <View style={styles.actions}>
        <MandiButton
          label="Approve as asked"
          size="md"
          loading={approve.isPending}
          onPress={() => approve.mutate()}
          style={styles.flex}
        />
        <MandiButton
          label="Review"
          variant="neutral"
          size="md"
          onPress={() => router.push(`/supplier/credit/${agreement.id}`)}
          style={styles.flex}
        />
      </View>
    </MandiCard>
  );
}

function Asked({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.askedCell}>
      <MandiText variant="caption" color={Colors.textSecondary}>{label}</MandiText>
      <MandiText variant="bodyEmphasis">{value}</MandiText>
    </View>
  );
}

function PortfolioCard({ agreement }: { agreement: CreditAgreement }) {
  const router = useRouter();
  const suspended = agreement.status === 'SUSPENDED';

  return (
    <MandiCard onPress={() => router.push(`/supplier/credit/${agreement.id}`)}>
      <View style={styles.row}>
        <MandiText variant="bodyEmphasis" style={styles.flex}>
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

      <View style={styles.cardFoot}>
        <MandiText variant="caption" color={Colors.textSecondary}>
          {suspended
            ? 'Suspended — open to reinstate or change the terms'
            : 'Open to change the limit, the period, or suspend it'}
        </MandiText>
        <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
      </View>
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
      <SupplierHeader subtitle="Credit" />
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
  asked: { flexDirection: 'row', gap: Spacing.xl, marginVertical: Spacing.sm },
  askedCell: { gap: 2 },
  cardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  exposure: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm, marginTop: Spacing.sm },
  figure: { gap: Spacing.xs },
});
