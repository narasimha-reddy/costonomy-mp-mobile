import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Pressable, RefreshControl, SectionList, StyleSheet, Text, View,
  type ViewToken,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePermissions } from '@/hooks/usePermissions';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { fetchWalletTransactions } from '@/services/wallet';
import {
  MandiBottomSheet,
  MandiButton,
  MandiEmptyState,
  MandiErrorState,
  MandiText,
  MandiSkeletonList,
} from '@/components/common';
import { TransactionRow } from '@/components/wallet/TransactionRow';
import { MonthHeader } from '@/components/wallet/MonthHeader';
import { MonthSheet, type MonthSheetData } from '@/components/wallet/MonthSheet';
import { BillBanner } from '@/components/wallet/BillBanner';
import { HistorySearch } from '@/components/wallet/HistorySearch';
import { FilterChips, type ActiveFilter } from '@/components/wallet/FilterChips';
import {
  BILL_FILTER_OPTIONS,
  CATEGORY_OPTIONS,
  billBanner,
  INSTRUMENT_OPTIONS,
  STATUS_OPTIONS,
  entryKey,
  filterCount,
  filterReducer,
  EMPTY_FILTER_PARAMS,
  filtersFromParams,
  filtersToParams,
  groupEntriesByMonth,
  matchesInstruments,
  mergeMonthTotals,
  mergePages,
  monthNet,
  SEARCH_DEBOUNCE_MS,
  monthTitle,
} from '@/lib/wallet/history';
import { billChipRoute } from '@/lib/wallet/billChip';
import { useBillListLive } from '@/hooks/useBillListLive';
import { searchEntries } from '@/lib/wallet/search';
import { useDebounced } from '@/hooks/useDebounced';
import { walletTransactionsKey } from '@/lib/queryKeys';
import type { WalletEntry } from '@/models/wallet';
import { Colors, Spacing, WalletColors, WalletLayout, WalletType } from '@/theme';

const PAGE_SIZE = 20;

/** With an instrument chosen, keep loading pages until this many rows match (or there are no more). */
const MIN_MATCHES = 10;

/**
 * REST-WALLET-02. Wallet Transaction History: everything that moved in or out of the
 * wallet, newest first, in month bars with what the month cost.
 *
 * <p>The one way into the past. The wallet screen's History action and "See all" both
 * land here. Filters live in the route (the Filters screen sends them back as params),
 * so a link or a refresh keeps them and no shared store is needed.
 *
 * <p>Months, categories and statuses are applied by the server; the instrument and the
 * search are not, so they narrow what has loaded and, since the server's month totals count
 * every row, the bands drop their total while either is on.
 */
export default function WalletHistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { accessToken } = useSession();
  const { outlet } = useOutlet();
  const { canForOutlet } = usePermissions();
  const mayAddBill = canForOutlet('QUICKSCAN_PAY', outlet);
  const params = useLocalSearchParams();

  const filters = useMemo(
    () => filtersFromParams(params as Record<string, string | undefined>),
    [params],
  );
  // What the server is asked; the instrument stays out so toggling it never refetches.
  const serverFilters = useMemo(
    () => ({ ...filters, instruments: [] }),
    [filters],
  );

  // Set below from what the list shows; read by the query's refetchInterval on its next render.
  const [reading, setReading] = useState(false);
  const refetchRef = useRef<() => unknown>(() => undefined);
  const refetchInterval = useBillListLive(reading, () => refetchRef.current());

  const history = useInfiniteQuery({
    queryKey: walletTransactionsKey(outlet?.id, serverFilters),
    queryFn: ({ pageParam }) => fetchWalletTransactions(
      accessToken as string, outlet?.id as number,
      { filters: serverFilters, cursor: pageParam, size: PAGE_SIZE }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: outlet != null && accessToken != null,
    refetchInterval,
  });
  refetchRef.current = () => history.refetch();

  const pages = history.data?.pages;
  const [query, setQuery] = useState('');
  const search = useDebounced(query.trim(), SEARCH_DEBOUNCE_MS);
  const searching = search !== '';
  const instrumentNarrowed = filters.instruments.length > 0;
  // The server's month totals count every row, so they say nothing about a narrowed list.
  const narrowed = instrumentNarrowed || searching;

  const entries = useMemo<WalletEntry[]>(
    () => searchEntries(
      mergePages(pages ?? []).filter((e) => matchesInstruments(e, filters.instruments)),
      search,
    ),
    [pages, filters.instruments, search],
  );
  const anyReading = entries.some((e) => e.bill?.status === 'READING');
  useEffect(() => { setReading(anyReading); }, [anyReading]);
  // Everything pending, whatever the filters and paging; absent on an older server.
  const billSummary = pages?.[0]?.billSummary ?? null;
  const banner = billBanner(billSummary, filters.bills);
  const totals = useMemo(() => mergeMonthTotals(pages ?? []), [pages]);
  const sections = useMemo(
    () => groupEntriesByMonth(entries).map(({ month, entries: data }) => {
      const net = monthNet(month, totals, narrowed);
      return {
        month,
        title: monthTitle(month),
        amount: net?.label ?? null,
        credit: net?.credit ?? false,
        sheet: net == null ? null : {
          title: monthTitle(month), moneyIn: net.moneyIn, moneyOut: net.moneyOut,
          net: net.label, credit: net.credit,
          billsPending: totals.find((t) => t.month === month)?.billsPending ?? null,
        },
        data,
      };
    }),
    [entries, totals, narrowed],
  );

  const [monthSheet, setMonthSheet] = useState<MonthSheetData | null>(null);

  // The band pinned to the top of the list is the one over the first row on screen.
  const [stuckMonth, setStuckMonth] = useState<string | null>(null);
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems.find((t) => t.item != null);
    const month = (first?.section as { month?: string } | undefined)?.month;
    if (month != null) setStuckMonth(month);
  });
  const nowRef = useRef(new Date());
  const [helpOpen, setHelpOpen] = useState(false);

  const { hasNextPage, isFetchingNextPage, fetchNextPage, isFetchNextPageError } = history;
  useEffect(() => {
    if (narrowed && hasNextPage && !isFetchingNextPage && !isFetchNextPageError
      && entries.length < MIN_MATCHES) {
      void fetchNextPage();
    }
  }, [narrowed, hasNextPage, isFetchingNextPage, isFetchNextPageError,
    entries.length, fetchNextPage]);

  const chips: ActiveFilter[] = [
    ...filters.months.map((m) => ({ key: `months:${m}`, label: monthTitle(m) })),
    ...filters.categories.map((c) => ({
      key: `categories:${c}`, label: CATEGORY_OPTIONS.find((o) => o.key === c)?.label ?? c })),
    ...filters.instruments.map((i) => ({
      key: `instruments:${i}`, label: INSTRUMENT_OPTIONS.find((o) => o.key === i)?.label ?? i })),
    ...filters.statuses.map((s) => ({
      key: `statuses:${s}`, label: STATUS_OPTIONS.find((o) => o.key === s)?.label ?? s })),
    ...filters.bills.map((b) => ({
      key: `bills:${b}`, label: BILL_FILTER_OPTIONS.find((o) => o.key === b)?.chipLabel ?? b })),
  ];

  function setFilters(next: typeof filters) {
    router.setParams({ ...EMPTY_FILTER_PARAMS, ...filtersToParams(next) });
  }
  function removeChip(key: string) {
    const [section, ...rest] = key.split(':');
    setFilters(filterReducer(filters,
      { type: 'toggle', section: section as keyof typeof filters, value: rest.join(':') }));
  }

  const openEntry = useCallback((entry: WalletEntry) => {
    router.push(`/restaurant/wallet/transaction/${entry.id}`);
  }, [router]);
  // Pending goes to Add bill; any other status opens the bill that is there.
  const openBill = useCallback((entry: WalletEntry) => {
    router.push(billChipRoute(entry));
  }, [router]);

  const openFilters = useCallback(() => router.push({
    pathname: '/restaurant/wallet/filters', params: filtersToParams(filters) }), [router, filters]);

  const header = (
    <View>
      <View style={styles.topBar}>
        <Pressable
          testID="history-back"
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={[styles.topTarget, styles.back]}
        >
          <Ionicons name="arrow-back" size={WalletLayout.helpIcon} color={WalletColors.ink} />
        </Pressable>
        <Pressable
          testID="history-help"
          onPress={() => setHelpOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Help with your history"
          style={({ pressed }) => [styles.topTarget, styles.help, pressed && styles.helpPressed]}
        >
          <Ionicons name="help-circle-outline" size={WalletLayout.helpIcon} color={WalletColors.ink} />
        </Pressable>
      </View>
      <View style={styles.titleRow}>
        <Text style={styles.title} accessibilityRole="header">History</Text>
        <Pressable
          testID="open-statements"
          onPress={() => router.push('/restaurant/wallet/statement')}
          accessibilityRole="button"
          accessibilityLabel="My statements"
          hitSlop={{ top: 5, bottom: 5 }}
          style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
        >
          <Ionicons
            name="arrow-down-circle-outline"
            size={WalletLayout.pillIcon}
            color={WalletColors.ink}
          />
          <Text style={styles.pillText}>My statements</Text>
        </Pressable>
      </View>
      <HistorySearch
        value={query}
        onChangeText={setQuery}
        onOpenFilters={openFilters}
        activeFilters={filterCount(filters)}
      />
      {banner != null && (
        <BillBanner
          state={banner}
          onShow={() => setFilters({ ...filters, bills: ['PENDING'] })}
          onClear={() => setFilters({ ...filters, bills: [] })}
        />
      )}
      <FilterChips filters={chips} onRemove={removeChip} />
    </View>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {header}

      {history.isPending ? (
        <View style={styles.pad}><MandiSkeletonList count={5} /></View>
      ) : history.isError && pages == null ? (
        <View style={styles.pad}>
          <MandiErrorState
            message="Couldn't load your wallet history."
            onRetry={() => history.refetch()}
            retrying={history.isRefetching}
          />
        </View>
      ) : (
        <SectionList
          testID="history-list"
          sections={sections}
          keyExtractor={entryKey}
          stickySectionHeadersEnabled
          renderSectionHeader={({ section }) => (
            <MonthHeader
              title={section.title}
              amount={section.amount}
              credit={section.credit}
              stuck={(stuckMonth ?? sections[0]?.month) === section.month}
              onPress={section.sheet != null ? () => setMonthSheet(section.sheet) : undefined}
            />
          )}
          renderItem={({ item, index, section }) => (
            <TransactionRow
              entry={item}
              now={nowRef.current}
              last={index === section.data.length - 1}
              onPress={openEntry}
              onBillPress={openBill}
              mayAddBill={mayAddBill}
            />
          )}
          onViewableItemsChanged={onViewable.current}
          viewabilityConfig={VIEWABILITY}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{
            paddingTop: WalletLayout.listTop, paddingBottom: insets.bottom + Spacing.xl }}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) void fetchNextPage();
          }}
          refreshControl={(
            <RefreshControl
              refreshing={history.isRefetching && !isFetchingNextPage}
              onRefresh={() => history.refetch()}
              tintColor={Colors.primary}
            />
          )}
          ListEmptyComponent={
            hasNextPage ? <View style={styles.pad}><MandiSkeletonList count={2} /></View> : (
              searching ? (
                <MandiEmptyState
                  icon="search-outline"
                  title="No matches"
                  description={`Nothing in your history matches “${search}”. Try a name, an order number or an amount.`}
                  actionLabel="Clear search"
                  onAction={() => setQuery('')}
                />
              ) : (
                <MandiEmptyState
                  icon="wallet-outline"
                  title={filterCount(filters) > 0 ? 'Nothing matches these filters' : 'Nothing yet'}
                  description={filterCount(filters) > 0
                    ? 'Try removing a filter to see more.'
                    : 'Money added, refunds and wallet payments will appear here.'}
                  actionLabel={filterCount(filters) > 0 ? 'Clear filters' : undefined}
                  onAction={filterCount(filters) > 0 ? () => setFilters(filterReducer(filters, { type: 'clear' })) : undefined}
                />
              )
            )
          }
          ListFooterComponent={
            isFetchingNextPage ? (
              <ActivityIndicator color={Colors.primary} style={styles.footer} />
            ) : isFetchNextPageError ? (
              <View style={styles.footer}>
                <MandiButton
                  label="Couldn't load more. Try again"
                  variant="tertiary"
                  size="sm"
                  onPress={() => fetchNextPage()}
                />
              </View>
            ) : null
          }
        />
      )}

      <MandiBottomSheet
        visible={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="Your wallet history"
        closeLabel="Close the history help"
      >
        <View style={styles.helpBody}>
          <MandiText>
            Every top-up, payment, refund and withdrawal, newest first, grouped by month. Tap a row
            for its details.
          </MandiText>
          <MandiText muted>
            Search by name, order number or amount, and use the filter button in the search box to
            narrow by month, type, status or bill. My Statements downloads a PDF or CSV.
          </MandiText>
          <MandiText muted>
            A small tag on a payment shows where its bill stands: pending, being read, added,
            reviewed, or needs a check. Tap it to add or see the bill.
          </MandiText>
        </View>
      </MandiBottomSheet>
      <MonthSheet data={monthSheet} onClose={() => setMonthSheet(null)} />
    </View>
  );
}

const VIEWABILITY = { itemVisiblePercentThreshold: 1 };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: WalletColors.background },
  topBar: { height: WalletLayout.historyTopBar },
  topTarget: {
    position: 'absolute',
    width: WalletLayout.tap,
    height: WalletLayout.tap,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: WalletLayout.tap / 2,
  },
  back: { left: 2, top: WalletLayout.historyIconTop },
  help: { right: WalletLayout.historyHelpRight, top: WalletLayout.historyIconTop },
  helpPressed: { backgroundColor: WalletColors.orangeTint },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: WalletLayout.pillHeight,
    paddingLeft: WalletLayout.titleLeft,
    paddingRight: WalletLayout.pillRight,
    marginBottom: WalletLayout.historySearchGap,
  },
  title: { ...WalletType.title, flex: 1, color: WalletColors.ink },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: WalletLayout.pillHeight,
    paddingLeft: WalletLayout.pillPadLeft,
    paddingRight: WalletLayout.pillPadRight,
    borderRadius: WalletLayout.pillRadius,
    borderWidth: WalletLayout.pillBorder,
    borderColor: WalletColors.pillBorder,
    backgroundColor: WalletColors.white,
  },
  pillPressed: { backgroundColor: WalletColors.orangeTint },
  pillText: { ...WalletType.pill, marginLeft: WalletLayout.pillIconGap, color: WalletColors.ink },
  pad: { paddingHorizontal: Spacing.screenHorizontal, paddingVertical: Spacing.lg },
  footer: { paddingVertical: Spacing.lg, alignItems: 'center' },
  helpBody: { gap: 12 },
});
