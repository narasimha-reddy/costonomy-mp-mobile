import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import {
  approveCredit, fetchReceivableRestaurants, fetchReceivables, fetchRefundsDue, fetchStoreAgreements,
} from '@/services/credit';
import { receivableRestaurantsKey, receivablesKey, receivablesRootKey, refundsDueKey } from '@/lib/queryKeys';
import type {
  CreditAgreement, ReceivableRestaurant, Receivables, ReceivablesSort, ReceivablesStatus,
} from '@/models/credit';
import { SupplierHeader } from '@/components/supplier/SupplierHeader';
import { CreditListCard, CreditListRow } from '@/components/credit/CreditListRow';
import { RoundAction } from '@/components/wallet/RoundAction';
import { GradientHero } from '@/components/common/GradientHero';
import {
  MandiButton,
  MandiCard,
  MandiEmptyState,
  MandiErrorState,
  MandiOfflineBanner,
  MandiScreen,
  MandiSearchBar,
  MandiSectionHeader,
  MandiSkeletonList,
  MandiStatusChip,
  PartyHeading,
  MandiText,
  useToast,
} from '@/components/common';
import { useDebounced } from '@/hooks/useDebounced';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { ApiError } from '@/lib/api/errors';
import { dueChip } from '@/lib/credit/dueChip';
import { barPercent, pendingActionView, restaurantLabel } from '@/lib/credit/receivables';
import { offerWording, oldestFirst, waitingWording } from '@/lib/credit/requestContext';
import { serverNow } from '@/lib/server-clock';
import { splitBalance } from '@/lib/wallet/display';
import { formatDay } from '@/utils/dateRange';
import { formatMoney } from '@/utils/money';
import { formatDistance } from '@/utils/orders';
import { track } from '@/analytics';
import { Colors, IconSize, Radius, Spacing } from '@/theme';
import { radioState } from '@/lib/a11y';

const SCREEN = 'SUP-CREDIT-01';
const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;
const MIN_TAP = 48;

const SORTS: { key: ReceivablesSort; label: string }[] = [
  { key: 'overdue', label: 'Most overdue' },
  { key: 'owed', label: 'Owes most' },
  { key: 'nextDue', label: 'Next due' },
];
const STATUSES: { key: ReceivablesStatus | null; id: string; label: string }[] = [
  { key: null, id: 'ALL', label: 'All' },
  { key: 'ACTIVE', id: 'ACTIVE', label: 'Active' },
  { key: 'SUSPENDED', id: 'SUSPENDED', label: 'Suspended' },
];

/**
 * SUP-CREDIT-01: Receivables home. Doc 05 §31–§32, plan S1.
 *
 * <p>What restaurants owe this store, first; the credit lines second. Every
 * figure, count, state and "needs doing" chip is the server's: the app words and
 * lays them out, and adds nothing up. New credit requests sit on top of the list
 * while any wait.
 *
 * <p><b>Approving a different limit is a modification, and the screen says so.</b>
 * Doc 04 §13: it does not take effect until the restaurant accepts it. A supplier
 * who thinks they have trimmed a limit, when in fact they have sent the
 * restaurant a question, will be surprised by the exposure that follows.
 */
export default function SupplierCreditScreen() {
  const { accessToken } = useSession();
  const { storeId } = useStore();
  const { offline } = useNetworkStatus();
  const router = useRouter();
  const toast = useToast();
  const enabled = storeId != null && accessToken != null;

  const [sort, setSort] = useState<ReceivablesSort>('overdue');
  const [status, setStatus] = useState<ReceivablesStatus | null>(null);
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), SEARCH_DEBOUNCE_MS);
  const [scrollTarget, setScrollTarget] = useState<{ y: number; token: number } | null>(null);
  const sections = useRef<{ requests: number; list: number }>({ requests: 0, list: 0 });

  const totals = useQuery({
    queryKey: receivablesKey(storeId),
    queryFn: () => fetchReceivables(accessToken as string, storeId as number),
    enabled,
  });
  const restaurants = useInfiniteQuery({
    queryKey: receivableRestaurantsKey(storeId, sort, status, q),
    queryFn: ({ pageParam }) => fetchReceivableRestaurants(accessToken as string, storeId as number, {
      sort, status, q, page: pageParam, size: PAGE_SIZE,
    }),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.hasNext ? all.length : undefined),
    placeholderData: keepPreviousData,
    enabled,
  });
  // The requests wait in the agreements list; the server's count says whether to show them.
  const agreements = useQuery({
    queryKey: ['store', storeId, 'credit-agreements'],
    queryFn: () => fetchStoreAgreements(accessToken as string, storeId as number),
    enabled,
  });

  // Refunds to give back after cancelled orders: one read, counted; a failure just hides the row.
  const refunds = useQuery({
    queryKey: refundsDueKey(storeId, 'OPEN'),
    queryFn: () => fetchRefundsDue(accessToken as string, storeId as number, 'OPEN'),
    enabled,
  });
  const refundCount = refunds.data?.length ?? 0;

  const data = totals.data;
  // Waiting requests, the one that has waited longest first; then offers sent and offers that lapsed.
  const requests = useMemo(
    () => oldestFirst((agreements.data ?? []).filter((a) => a.status === 'REQUESTED'), (a) => a.latestRequest?.createdAt),
    [agreements.data],
  );
  const offers = useMemo(
    () => (agreements.data ?? []).filter((a) => a.status === 'APPROVED' || a.status === 'EXPIRED'),
    [agreements.data],
  );
  const rows = useMemo(
    () => (restaurants.data?.pages ?? []).flatMap((p) => p.items),
    [restaurants.data],
  );

  const mark = (name: 'requests' | 'list') => (e: LayoutChangeEvent) => { sections.current[name] = e.nativeEvent.layout.y; };
  const scrollTo = useCallback((name: 'requests' | 'list') => {
    setScrollTarget((prev) => ({ y: sections.current[name], token: (prev?.token ?? 0) + 1 }));
  }, []);

  const openRequests = () => {
    if ((data?.counts.requestsPending ?? 0) > 0) scrollTo('requests');
    else toast.show('No credit requests waiting', 'info');
  };

  const refetchAll = () => {
    void totals.refetch();
    void restaurants.refetch();
    void agreements.refetch();
  };

  const noAccess = totals.error instanceof ApiError && totals.error.status === 404;

  return (
    <MandiScreen
      header={<SupplierHeader subtitle="Credit" />}
      onRefresh={refetchAll}
      refreshing={totals.isRefetching || restaurants.isRefetching}
      scrollTarget={scrollTarget}
      moreBelow="More below"
    >
      <MandiOfflineBanner visible={offline} />
      {totals.isPending ? (
        <MandiSkeletonList count={3} />
      ) : noAccess ? (
        <MandiEmptyState
          icon="lock-closed-outline"
          title="You don't have access to credit for this store"
          description="Ask the store owner to give you access to credit."
        />
      ) : totals.error || data == null ? (
        <MandiErrorState message="Couldn't load your receivables." onRetry={() => totals.refetch()} />
      ) : (
        <>
          <ReceivablesHero data={data} />
          <ExposureCard data={data} />

          <View style={styles.actions} testID="receivables-actions">
            <RoundAction
              testID="action-claims"
              icon={{ set: 'mci', name: 'cash-check' }}
              label="Claims"
              glyphTone="strong"
              badge={data.counts.claimsWaiting}
              accessibilityHint="Payments restaurants say they made to you directly"
              primary={data.counts.claimsWaiting > 0}
              onPress={() => router.push('/supplier/credit/claims')}
            />
            <RoundAction
              testID="action-ageing"
              icon="bar-chart-outline"
              label="Ageing"
              glyphTone="strong"
              accessibilityHint="What is owed, by how late it is"
              onPress={() => router.push('/supplier/credit/ageing')}
            />
            <RoundAction
              testID="action-payouts"
              icon="wallet-outline"
              label="Payouts"
              glyphTone="strong"
              accessibilityHint="Money sent to your bank"
              onPress={() => router.push('/supplier/credit/payouts')}
            />
            <RoundAction
              testID="action-requests"
              icon="mail-unread-outline"
              label="Requests"
              glyphTone="strong"
              accessibilityHint="Restaurants asking you for credit"
              onPress={openRequests}
            />
          </View>

          <PendingStrip
            data={data}
            onGo={(target) => {
              if (target.route != null) router.push(target.route);
              if (target.sort != null) setSort(target.sort);
              if (target.scroll != null) scrollTo(target.scroll);
            }}
          />

          {refundCount > 0 && (
            <Pressable
              testID="refunds-entry"
              onPress={() => router.push('/supplier/credit/refunds')}
              accessibilityRole="button"
              accessibilityLabel={`Refunds to give back, ${refundCount}`}
              style={({ pressed }) => [styles.pending, pressed && styles.pressed]}
            >
              <MandiText variant="captionEmphasis" color={Colors.primaryDark} style={styles.flex}>
                {`Refunds to give back (${refundCount})`}
              </MandiText>
              <Ionicons name="chevron-forward" size={IconSize.sm} color={Colors.primaryDark} />
            </Pressable>
          )}

          {data.counts.requestsPending > 0 && requests.length > 0 && (
            <View style={styles.section} onLayout={mark('requests')} testID="new-requests">
              <MandiSectionHeader title="New requests" count={requests.length} />
              {requests.map((agreement) => (
                <RequestCard key={agreement.id} agreement={agreement} offline={offline} />
              ))}
              {offers.map((agreement) => (
                <RequestCard key={agreement.id} agreement={agreement} offline={offline} />
              ))}
            </View>
          )}

          <View style={styles.section} onLayout={mark('list')}>
            <MandiSectionHeader title="Restaurants" />
            <MandiSearchBar
              testID="receivables-search"
              value={search}
              onChangeText={setSearch}
              placeholder="Search restaurants"
            />
            <View style={styles.chips} accessibilityRole="radiogroup">
              {SORTS.map((o) => (
                <Chip key={o.key} testID={`sort-${o.key}`} label={o.label} selected={sort === o.key} onPress={() => setSort(o.key)} />
              ))}
            </View>
            <View style={styles.chips} accessibilityRole="radiogroup">
              {STATUSES.map((o) => (
                <Chip key={o.id} testID={`status-${o.id}`} label={o.label} selected={status === o.key} onPress={() => setStatus(o.key)} />
              ))}
            </View>

            {restaurants.isPending ? (
              <MandiSkeletonList count={3} />
            ) : restaurants.error ? (
              <MandiErrorState message="Couldn't load your restaurants." onRetry={() => restaurants.refetch()} />
            ) : rows.length === 0 ? (
              <ListEmpty data={data} filtered={q !== '' || status != null} />
            ) : (
              <>
                <CreditListCard testID="restaurant-list">
                  {rows.map((r, i) => (
                    <RestaurantRow
                      key={r.agreementId}
                      row={r}
                      last={i === rows.length - 1}
                      onPress={() => router.push(`/supplier/credit/${r.agreementId}`)}
                    />
                  ))}
                </CreditListCard>
                {restaurants.hasNextPage && (
                  <MandiButton
                    testID="show-more"
                    label="Show more restaurants"
                    variant="neutral"
                    loading={restaurants.isFetchingNextPage}
                    onPress={() => { void restaurants.fetchNextPage(); }}
                  />
                )}
              </>
            )}
          </View>
        </>
      )}
    </MandiScreen>
  );
}

/** To receive, on the same orange card as the wallet; overdue as words and an icon, never colour alone. */
function ReceivablesHero({ data }: { data: Receivables }) {
  const overdue = data.overdue > 0;
  const spoken = [
    `To receive ${formatMoney(data.totalReceivable)}`,
    overdue ? `${formatMoney(data.overdue)} overdue` : null,
  ].filter(Boolean).join(', ');
  return (
    <GradientHero
      testID="receivables-hero"
      label="To receive"
      split={splitBalance(data.totalReceivable)}
      accessibilityLabel={spoken}
    >
      {overdue && (
        <View style={styles.pill} testID="receivables-overdue">
          <Ionicons name="alert-circle" size={IconSize.sm} color={Colors.danger} />
          <MandiText variant="captionEmphasis" color={Colors.danger} numberOfLines={1} style={styles.flex}>
            {`${formatMoney(data.overdue)} overdue`}
          </MandiText>
        </View>
      )}
    </GradientHero>
  );
}

/** What is lent against what was extended, and what came in this month. Purple is for credit bars only. */
function ExposureCard({ data }: { data: Receivables }) {
  const { extended, drawn } = data.exposure;
  const percent = barPercent(drawn, extended);
  const lent = `Lent ${formatMoney(drawn)} of ${formatMoney(extended)}`;
  return (
    <MandiCard testID="exposure-card">
      <MandiText variant="bodyEmphasis">{lent}</MandiText>
      {percent != null && (
        <View
          style={styles.track}
          testID="exposure-bar"
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={lent}
          accessibilityValue={{ min: 0, max: 100, now: Math.round(percent) }}
        >
          <View style={[styles.fill, { width: `${percent}%` }]} />
        </View>
      )}
      <View style={styles.collected}>
        <MandiText variant="caption" color={Colors.textSecondary}>Collected this month</MandiText>
        <MandiText variant="bodyEmphasis" numberOfLines={1} style={styles.flex}>
          {formatMoney(data.collectedThisMonth)}
        </MandiText>
      </View>
    </MandiCard>
  );
}

/** Only what the server says needs doing, in the server's order. A kind we cannot word is not drawn. */
function PendingStrip({ data, onGo }: {
  data: Receivables;
  onGo: (target: NonNullable<ReturnType<typeof pendingActionView>>['target']) => void;
}) {
  const views = data.pendingActions
    .map((a) => pendingActionView(a))
    .filter((v): v is NonNullable<typeof v> => v != null);
  if (views.length === 0) return null;
  return (
    <View style={styles.chips} testID="pending-strip">
      {views.map((v) => (
        <Pressable
          key={v.kind}
          testID={`pending-${v.kind}`}
          onPress={() => onGo(v.target)}
          accessibilityRole="button"
          accessibilityLabel={v.label}
          style={({ pressed }) => [styles.pending, pressed && styles.pressed]}
        >
          <MandiText variant="captionEmphasis" color={Colors.primaryDark} style={styles.flex}>{v.label}</MandiText>
          <Ionicons name="chevron-forward" size={IconSize.sm} color={Colors.primaryDark} />
        </Pressable>
      ))}
    </View>
  );
}

function Chip({ label, selected, onPress, testID }: {
  label: string; selected: boolean; onPress: () => void; testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={radioState(selected)}
      accessibilityLabel={label}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <MandiText variant="captionEmphasis" color={selected ? Colors.textInverse : Colors.textSecondary}>
        {label}
      </MandiText>
    </Pressable>
  );
}

function ListEmpty({ data, filtered }: { data: Receivables; filtered: boolean }) {
  if (filtered) {
    return <MandiEmptyState icon="search-outline" title="No restaurant matches" description="Try another name, or choose All." />;
  }
  if (data.counts.restaurants === 0) {
    return (
      <MandiEmptyState
        icon="card-outline"
        title="No restaurant has credit with you yet"
        description="It starts when a restaurant asks you for credit. You say yes, and what they owe shows up here."
      />
    );
  }
  return <MandiEmptyState icon="card-outline" title="No restaurants to show" />;
}

function RestaurantRow({ row, last, onPress }: { row: ReceivableRestaurant; last: boolean; onPress: () => void }) {
  const name = restaurantLabel(row);
  const overdue = row.overdue > 0;
  const chip = overdue ? null : dueChip(row.dueState, null);
  const nextDay = row.nextDueDate != null ? formatDay(row.nextDueDate) ?? row.nextDueDate : null;
  const nextDue = row.nextDueAmount != null && nextDay != null
    ? `Due ${formatMoney(row.nextDueAmount)} on ${nextDay}`
    : null;
  const percent = barPercent(row.utilization, 100);
  const suspended = row.status === 'SUSPENDED';
  const spoken = [
    name.primary, name.secondary, `owes ${formatMoney(row.owed)}`,
    overdue ? `${formatMoney(row.overdue)} overdue` : null, nextDue, suspended ? 'suspended' : null,
    row.claimsWaiting > 0 ? `${row.claimsWaiting} payment${row.claimsWaiting === 1 ? '' : 's'} waiting for your OK` : null,
  ].filter(Boolean).join(', ');

  return (
    <CreditListRow testID={`restaurant-row-${row.agreementId}`} onPress={onPress} accessibilityLabel={spoken} last={last}>
      <View style={styles.rowTop}>
        <View style={styles.flex}>
          <MandiText variant="bodyEmphasis" numberOfLines={2}>{name.primary}</MandiText>
          {name.secondary != null && (
            <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1}>{name.secondary}</MandiText>
          )}
        </View>
        {row.claimsWaiting > 0 && (
          <View
            testID={`claims-dot-${row.agreementId}`}
            accessible
            accessibilityLabel={`${row.claimsWaiting} payment${row.claimsWaiting === 1 ? '' : 's'} waiting for your OK`}
            style={styles.dot}
          />
        )}
        <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
      </View>
      <MandiText variant="bodyEmphasis" numberOfLines={1}>{formatMoney(row.owed)}</MandiText>
      <View style={styles.chips}>
        {overdue && <MandiStatusChip label={`${formatMoney(row.overdue)} overdue`} tone="danger" size="sm" />}
        {chip != null && <MandiStatusChip label={chip.label} tone={chip.tone} size="sm" />}
        {suspended && <MandiStatusChip label="suspended" tone="warning" size="sm" />}
      </View>
      {nextDue != null && (
        <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={2}>{nextDue}</MandiText>
      )}
      {percent != null && (
        <View style={styles.util}>
          <View
            style={styles.track}
            testID={`utilisation-${row.agreementId}`}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={`${row.utilization}% of limit used`}
            accessibilityValue={{ min: 0, max: 100, now: Math.round(percent) }}
          >
            <View style={[styles.fill, { width: `${percent}%` }]} />
          </View>
          <MandiText variant="caption" color={Colors.textSecondary}>{`${row.utilization}% of limit used`}</MandiText>
        </View>
      )}
    </CreditListRow>
  );
}

function RequestCard({ agreement, offline }: { agreement: CreditAgreement; offline: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();
  const { storeId } = useStore();
  const request = agreement.latestRequest;
  // An offer already sent (or lapsed) is not a request waiting on this supplier: it has no actions.
  const offer = offerWording(agreement);
  const waiting = agreement.status === 'REQUESTED' ? waitingWording(request?.createdAt, new Date(serverNow())) : null;

  const approve = useMutation({
    // No arguments approves exactly what was asked for. Anything else is a
    // modification the restaurant has to accept, which is a decision worth a
    // screen rather than a text box on a list.
    mutationFn: () => approveCredit(accessToken as string, agreement.id, {}),
    onSuccess: () => {
      track('credit_approved', { screen: SCREEN, entityId: agreement.id }, { modified: false });
      void queryClient.invalidateQueries({ queryKey: ['store', storeId, 'credit-agreements'] });
      // A new line changes what the restaurant list and the totals show.
      void queryClient.invalidateQueries({ queryKey: receivablesRootKey(storeId) });
      toast.show('Credit approved', 'success');
    },
    onError: (caught) =>
      toast.show(caught instanceof ApiError ? caught.message : 'Could not approve.', 'error'),
  });

  return (
    <MandiCard outlined accentColor={Colors.primary}>
      <PartyHeading
        primary={agreement.outletName ?? `Outlet ${agreement.outletId}`}
        secondary={[
          agreement.restaurantName,
          agreement.outletLocality,
          formatDistance(agreement.distanceKm),
        ]}
        trailing={offer == null ? <MandiStatusChip label="new request" tone="pending" size="sm" /> : undefined}
      />
      {offer != null && (
        <MandiText variant="caption" color={Colors.textSecondary} testID={`offer-${agreement.id}`}>{offer}</MandiText>
      )}
      {request?.purpose != null && (
        <MandiText variant="caption" color={Colors.textPrimary}>
          {request.purpose}
        </MandiText>
      )}

      <View style={styles.asked}>
        <Asked label="Limit" value={formatMoney(request?.requestedLimit)} />
        <Asked label="Period" value={`${request?.requestedPeriodDays ?? '—'} days`} />
      </View>

      {waiting != null && (
        <MandiText variant="caption" color={Colors.textTertiary} testID={`waiting-${agreement.id}`}>{waiting}</MandiText>
      )}

      {offer == null && (
      <View style={styles.actionsRow}>
        <MandiButton
          label="Approve As Asked"
          size="md"
          loading={approve.isPending}
          disabled={offline}
          onPress={() => approve.mutate()}
          style={styles.flex}
        />
        <MandiButton
          label="Review"
          variant="neutral"
          size="md"
          onPress={() => router.push(`/supplier/credit/request/${agreement.id}`)}
          style={styles.flex}
        />
      </View>
      )}
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

const styles = StyleSheet.create({
  flex: { flex: 1, flexShrink: 1 },
  section: { gap: Spacing.listGap },
  actions: { flexDirection: 'row', gap: Spacing.sm },
  actionsRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  asked: { flexDirection: 'row', gap: Spacing.xl, marginVertical: Spacing.sm },
  askedCell: { gap: 2 },
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    backgroundColor: Colors.white,
    maxWidth: '100%',
  },
  track: { height: 6, borderRadius: Radius.full, backgroundColor: Colors.surfaceSunken, overflow: 'hidden' },
  fill: { height: 6, borderRadius: Radius.full, backgroundColor: Colors.credit },
  collected: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm, marginTop: Spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  pending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: MIN_TAP,
    maxWidth: '100%',
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
    backgroundColor: Colors.primaryLight,
  },
  pressed: { opacity: 0.85 },
  chip: {
    minHeight: MIN_TAP,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceSunken,
  },
  chipSelected: { backgroundColor: Colors.primary },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  dot: { width: 10, height: 10, borderRadius: Radius.full, backgroundColor: Colors.primary },
  util: { gap: 2, marginTop: Spacing.xs },
});
