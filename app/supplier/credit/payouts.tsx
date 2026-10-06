import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { fetchPayments, fetchPayouts } from '@/services/credit';
import { CsvExportError, fetchCollectionsCsv, shareCsv } from '@/services/creditExport';
import type {
  CreditPayout, PayoutStatusFilter, StorePayment, StorePaymentSource,
} from '@/models/credit';
import { StoreSelector } from '@/components/supplier/StoreSelector';
import { FilterChips, type ActiveFilter } from '@/components/wallet/FilterChips';
import { PaymentRow, PayoutRow } from '@/components/credit/PayoutRow';
import { PayoutSheet } from '@/components/credit/PayoutSheet';
import {
  MandiEmptyState,
  MandiErrorState,
  MandiHeader,
  MandiOfflineBanner,
  MandiSectionHeader,
  MandiSkeletonList,
  MandiText,
  useToast,
} from '@/components/common';
import { GradientHero } from '@/components/common/GradientHero';
import { useCsvExport } from '@/hooks/useCsvExport';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import {
  EMPTY_PAYOUT_PARAMS,
  PAGE_SIZE,
  groupPayouts,
  payoutFilterCount,
  payoutFiltersFromParams,
  payoutFiltersToParams,
  payoutRange,
  payoutReducer,
} from '@/lib/credit/payouts';
import { PERIOD_PRESETS } from '@/lib/credit/statementFilters';
import { payoutsKey, storePaymentsKey } from '@/lib/queryKeys';
import { splitBalance } from '@/lib/wallet/display';
import { monthTitle } from '@/lib/wallet/history';
import { formatMoney } from '@/utils/money';
import { Colors, IconSize, Radius, Spacing, WalletColors } from '@/theme';

type Tab = 'mandi' | 'recorded';

const STATUS_CHIPS: { key: PayoutStatusFilter; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'APPLIED', label: 'Paid out' },
];
const SOURCE_CHIPS: { key: StorePaymentSource | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'SUPPLIER_RECORDED', label: 'Recorded by you' },
  { key: 'CLAIM_CONFIRMED', label: 'From their claim' },
  { key: 'WALLET', label: 'Mandi wallet' },
];

type Section = { key: string; status: string | null; title: string; data: (CreditPayout | StorePayment)[] };

/**
 * Collections and payouts: all the money a restaurant paid this store on credit. One side
 * is what Mandi collected from restaurants' wallets and pays out in settlements; the other
 * is what the supplier recorded or confirmed. Every figure, rate, status and date is the
 * server's; this screen groups, words and pages, and never adds anything up.
 */
export default function PayoutsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { accessToken } = useSession();
  const { storeId } = useStore();
  const { offline } = useNetworkStatus();
  const params = useLocalSearchParams();

  const [tab, setTab] = useState<Tab>('mandi');
  const [status, setStatus] = useState<PayoutStatusFilter>('ALL');
  const [source, setSource] = useState<StorePaymentSource | 'ALL'>('ALL');
  const [openId, setOpenId] = useState<number | null>(null);
  const csv = useCsvExport();

  const filters = useMemo(
    () => payoutFiltersFromParams(params as Record<string, string | undefined>),
    [params],
  );
  const range = useMemo(() => payoutRange(filters), [filters]);
  const from = range?.from;
  const to = range?.to;
  const ready = storeId != null && accessToken != null;

  const payouts = useInfiniteQuery({
    queryKey: payoutsKey(storeId, status, from ?? null, to ?? null),
    queryFn: ({ pageParam }) => fetchPayouts(accessToken as string, storeId as number,
      { status, from, to, page: pageParam, size: PAGE_SIZE }),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.hasNext ? last.page + 1 : undefined),
    enabled: ready && tab === 'mandi',
  });
  const payments = useInfiniteQuery({
    queryKey: storePaymentsKey(storeId, source, from ?? null, to ?? null),
    queryFn: ({ pageParam }) => fetchPayments(accessToken as string, storeId as number, {
      source: source === 'ALL' ? undefined : source, from, to, page: pageParam, size: PAGE_SIZE }),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.hasNext ? last.page + 1 : undefined),
    enabled: ready && tab === 'recorded',
  });
  const active = tab === 'mandi' ? payouts : payments;

  const payoutItems = useMemo(() => payouts.data?.pages.flatMap((p) => p.items) ?? [], [payouts.data]);
  const paymentItems = useMemo(() => payments.data?.pages.flatMap((p) => p.items) ?? [], [payments.data]);
  const summary = payouts.data?.pages[0]?.summary ?? null;

  const sections = useMemo<Section[]>(() => (tab === 'mandi'
    ? groupPayouts(payoutItems).map((g) => ({ key: g.status, status: g.status, title: g.title, data: g.items }))
    : paymentItems.length > 0 ? [{ key: 'payments', status: null, title: '', data: paymentItems }] : []),
  [tab, payoutItems, paymentItems]);

  // Looked up by id so a refetch that drops the payout closes the sheet.
  const open = payoutItems.find((p) => p.payoutId === openId) ?? null;

  const filterTotal = payoutFilterCount(filters);
  const chips: ActiveFilter[] = filters.months.length > 0
    ? filters.months.map((m) => ({ key: `months:${m}`, label: monthTitle(m) }))
    : filters.period != null
      ? [{ key: 'period', label: PERIOD_PRESETS.find((p) => p.key === filters.period)?.label ?? filters.period }]
      : [];

  function setFilters(next: typeof filters) {
    router.setParams({ ...EMPTY_PAYOUT_PARAMS, ...payoutFiltersToParams(next) });
  }
  function removeChip(key: string) {
    const [section = '', ...rest] = key.split(':');
    if (section === 'months') {
      const value = rest.join(':');
      setFilters(payoutReducer(filters, { type: 'toggle', value }));
    } else setFilters(payoutReducer(filters, { type: 'clear' }));
  }
  const clearFilters = () => setFilters(payoutReducer(filters, { type: 'clear' }));

  const openFilters = useCallback(() => router.push({
    pathname: '/supplier/credit/payouts-filters',
    params: payoutFiltersToParams(filters),
  } as never), [router, filters]);

  const copy = useCallback(async (number: string) => {
    try {
      await Clipboard.setStringAsync(number);
      toast.show('Copied', 'success');
    } catch {
      toast.show('Could not copy the settlement number', 'error');
    }
  }, [toast]);

  const narrowed = tab === 'mandi' ? status !== 'ALL' || filterTotal > 0 : source !== 'ALL' || filterTotal > 0;

  const hero = tab === 'mandi' && summary != null ? (
    <View style={styles.heroWrap}>
      <GradientHero
        testID="payouts-hero"
        label="Coming to you"
        split={splitBalance(summary.pendingNet)}
        accessibilityLabel={`Coming to you ${formatMoney(summary.pendingNet)}. Paid to you this month ${formatMoney(summary.appliedNetThisMonth)}`}
      >
        <View style={styles.monthRow}>
          <MandiText variant="caption" color={Colors.onGradientMuted}>Paid to you this month</MandiText>
          <MandiText variant="subtitle" color={Colors.onGradient} testID="payouts-paid-month" style={styles.monthAmount}>
            {formatMoney(summary.appliedNetThisMonth)}
          </MandiText>
        </View>
      </GradientHero>
    </View>
  ) : null;

  const header = (
    <>
      {hero}
      {tab === 'recorded' && (
        <View style={styles.csvRow}>
          <Pressable
            testID="collections-csv"
            onPress={() => {
              if (offline) { void csv.run(() => Promise.reject(new CsvExportError('offline'))); return; }
              void csv.run(async () => {
                const file = await fetchCollectionsCsv(accessToken as string, storeId as number, {
                  from: from ?? null, to: to ?? null, source: source === 'ALL' ? null : source,
                });
                await shareCsv(file);
              });
            }}
            disabled={!ready}
            accessibilityRole="button"
            accessibilityLabel="Download collections CSV"
            accessibilityState={{ busy: csv.exporting }}
            style={styles.csvButton}
          >
            <Ionicons name="download-outline" size={IconSize.md} color={Colors.primary} />
            <MandiText variant="bodyEmphasis" color={Colors.primary}>
              {csv.exporting ? 'Preparing the file' : 'Download collections CSV'}
            </MandiText>
          </Pressable>
          {csv.error != null && (
            <MandiText variant="caption" color={Colors.danger} accessibilityLiveRegion="polite" testID="collections-csv-error">
              {csv.error}
            </MandiText>
          )}
        </View>
      )}
      <MandiText variant="caption" color={Colors.textSecondary} style={styles.note}>
        {tab === 'mandi'
          ? 'Money restaurants paid from their Mandi wallet. We pay it to you in your settlements.'
          : 'Payments on your credit lines.'}
      </MandiText>
    </>
  );

  let empty: React.ReactNode;
  if (tab === 'mandi') {
    empty = narrowed ? (
      <MandiEmptyState
        icon="cash-outline"
        title="No payouts match these filters."
        actionLabel="Clear filters"
        onAction={() => { setStatus('ALL'); clearFilters(); }}
      />
    ) : (
      <MandiEmptyState
        icon="cash-outline"
        title="No payouts yet. When a restaurant pays you from their Mandi wallet it shows here."
      />
    );
  } else {
    empty = narrowed ? (
      <MandiEmptyState
        icon="cash-outline"
        title="No payments match these filters."
        actionLabel="Clear filters"
        onAction={() => { setSource('ALL'); clearFilters(); }}
      />
    ) : (
      <MandiEmptyState
        icon="cash-outline"
        title="No payments yet. Payments you record, or confirm from a claim, show here."
      />
    );
  }

  const footer = active.hasNextPage ? (
    <Pressable
      testID="show-more"
      onPress={() => { if (!active.isFetchingNextPage) void active.fetchNextPage(); }}
      accessibilityRole="button"
      accessibilityLabel="Show more"
      style={styles.more}
    >
      <MandiText variant="bodyEmphasis" color={Colors.primary}>
        {active.isFetchNextPageError ? 'Could not load more. Tap to try again' : active.isFetchingNextPage ? 'Loading' : 'Show more'}
      </MandiText>
    </Pressable>
  ) : null;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <MandiHeader title="Collections and payouts" back right={<StoreSelector />} />
      <MandiOfflineBanner visible={offline} />

      <View style={styles.tabs} accessibilityRole="tablist">
        {([['mandi', 'Collected through Mandi'], ['recorded', 'Recorded by you']] as const).map(([key, label]) => (
          <Pressable
            key={key}
            testID={`tab-${key}`}
            onPress={() => setTab(key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === key }}
            style={[styles.tab, tab === key && styles.tabOn]}
          >
            <MandiText variant="bodyEmphasis" color={tab === key ? Colors.textInverse : Colors.textPrimary} style={styles.center}>
              {label}
            </MandiText>
          </Pressable>
        ))}
      </View>

      <View style={styles.filterRow}>
        <View style={styles.chips}>
          {(tab === 'mandi' ? STATUS_CHIPS : SOURCE_CHIPS).map((chip) => {
            const on = tab === 'mandi' ? status === chip.key : source === chip.key;
            return (
              <Pressable
                key={chip.key}
                testID={tab === 'mandi' ? `payout-status-${chip.key}` : `source-${chip.key}`}
                onPress={() => (tab === 'mandi' ? setStatus(chip.key as PayoutStatusFilter) : setSource(chip.key as StorePaymentSource | 'ALL'))}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.chip, on && styles.chipOn]}
              >
                <MandiText variant="captionEmphasis" color={on ? Colors.textInverse : Colors.textPrimary}>
                  {chip.label}
                </MandiText>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          testID="open-filters"
          onPress={openFilters}
          accessibilityRole="button"
          accessibilityLabel={filterTotal > 0 ? `Filters, ${filterTotal} on` : 'Filters'}
          style={styles.filterButton}
        >
          <Ionicons name="options-outline" size={IconSize.md} color={Colors.primary} />
          <MandiText variant="bodyEmphasis" color={Colors.primary}>
            {filterTotal > 0 ? `Filters (${filterTotal})` : 'Filters'}
          </MandiText>
        </Pressable>
      </View>
      <FilterChips filters={chips} onRemove={removeChip} onClearAll={chips.length > 0 ? clearFilters : undefined} />

      {active.isPending ? (
        <View style={styles.pad} testID="payouts-loading"><MandiSkeletonList count={4} /></View>
      ) : active.isError ? (
        <View style={styles.pad}>
          <MandiErrorState
            message={tab === 'mandi' ? "Couldn't load your payouts." : "Couldn't load your payments."}
            onRetry={() => active.refetch()}
            retrying={active.isRefetching}
            testID="payouts-error"
          />
        </View>
      ) : (
        <SectionList
          testID="payouts-list"
          sections={sections}
          keyExtractor={(row) => ('payoutId' in row ? `p-${row.payoutId}` : `m-${row.id}`)}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={header}
          ListFooterComponent={footer}
          ListEmptyComponent={<View style={styles.pad}>{empty}</View>}
          initialNumToRender={PAGE_SIZE + 4}
          onEndReached={() => { if (active.hasNextPage && !active.isFetchingNextPage && !active.isFetchNextPageError) void active.fetchNextPage(); }}
          onEndReachedThreshold={0.5}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + Spacing.xl }]}
          refreshControl={(
            <RefreshControl
              refreshing={active.isRefetching && !active.isFetchingNextPage}
              onRefresh={() => { void active.refetch(); }}
              tintColor={Colors.primary}
            />
          )}
          renderSectionHeader={({ section }) => (section.title === '' ? null : (
            <View testID={`payout-group-${section.status}`}><MandiSectionHeader title={section.title} /></View>
          ))}
          renderItem={({ item }) => (
            <View style={styles.item}>
              {'payoutId' in item
                ? <PayoutRow payout={item} onPress={() => setOpenId(item.payoutId)} />
                : <PaymentRow payment={item} />}
            </View>
          )}
        />
      )}

      <PayoutSheet payout={open} visible={open != null} onClose={() => setOpenId(null)} onCopy={(n) => { void copy(n); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: WalletColors.background },
  pad: { paddingHorizontal: Spacing.screenHorizontal, paddingVertical: Spacing.lg },
  list: { paddingHorizontal: Spacing.screenHorizontal, paddingTop: Spacing.md },
  item: { paddingVertical: Spacing.xs },
  heroWrap: { paddingBottom: Spacing.md },
  monthRow: { gap: 2 },
  monthAmount: { flexShrink: 1 },
  note: { paddingBottom: Spacing.sm },
  tabs: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.screenHorizontal, paddingTop: Spacing.md },
  tab: {
    flex: 1, minHeight: 48, justifyContent: 'center', paddingHorizontal: Spacing.md,
    borderRadius: Radius.full, backgroundColor: Colors.surfaceSunken,
  },
  tabOn: { backgroundColor: Colors.primary },
  center: { textAlign: 'center' },
  filterRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm,
    paddingHorizontal: Spacing.screenHorizontal, paddingTop: Spacing.sm,
  },
  chips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    minHeight: 48, justifyContent: 'center', paddingHorizontal: Spacing.lg,
    borderRadius: Radius.full, backgroundColor: Colors.surfaceSunken,
  },
  chipOn: { backgroundColor: Colors.primary },
  filterButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  csvRow: { gap: Spacing.xs, paddingBottom: Spacing.sm },
  csvButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  more: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.md },
});
