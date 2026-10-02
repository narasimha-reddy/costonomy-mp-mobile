import React, { useEffect, useMemo } from 'react';
import { ActivityIndicator, RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { fetchWalletTransactions } from '@/services/wallet';
import {
  MandiButton,
  MandiEmptyState,
  MandiErrorState,
  MandiHeader,
  MandiSkeletonList,
} from '@/components/common';
import { TransactionRow } from '@/components/wallet/TransactionRow';
import { MonthHeader } from '@/components/wallet/MonthHeader';
import { PillButton } from '@/components/wallet/PillButton';
import { FilterChips, type ActiveFilter } from '@/components/wallet/FilterChips';
import {
  CATEGORY_OPTIONS,
  INSTRUMENT_OPTIONS,
  STATUS_OPTIONS,
  entryKey,
  filterCount,
  filterReducer,
  filtersFromParams,
  filtersToParams,
  groupEntriesByMonth,
  matchesInstruments,
  mergeMonthTotals,
  mergePages,
  monthSpentLabel,
  monthTitle,
} from '@/lib/wallet/history';
import { walletTransactionsKey } from '@/lib/queryKeys';
import type { WalletEntry } from '@/models/wallet';
import { Colors, Spacing } from '@/theme';

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
 * <p>Months, categories and statuses are applied by the server; the instrument is not,
 * so it narrows what has loaded and, since the server's month totals count every
 * instrument, the bars drop their total while it is on.
 */
export default function WalletHistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { accessToken } = useSession();
  const { outlet } = useOutlet();
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

  const history = useInfiniteQuery({
    queryKey: walletTransactionsKey(outlet?.id, serverFilters),
    queryFn: ({ pageParam }) => fetchWalletTransactions(
      accessToken as string, outlet?.id as number,
      { filters: serverFilters, cursor: pageParam, size: PAGE_SIZE }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: outlet != null && accessToken != null,
  });

  const pages = history.data?.pages;
  const instrumentNarrowed = filters.instruments.length > 0;

  const entries = useMemo<WalletEntry[]>(
    () => mergePages(pages ?? []).filter((e) => matchesInstruments(e, filters.instruments)),
    [pages, filters.instruments],
  );
  const totals = useMemo(() => mergeMonthTotals(pages ?? []), [pages]);
  const sections = useMemo(
    () => groupEntriesByMonth(entries).map(({ month, entries: data }) => ({
      month,
      title: monthTitle(month),
      spent: monthSpentLabel(month, totals, instrumentNarrowed),
      data,
    })),
    [entries, totals, instrumentNarrowed],
  );

  const { hasNextPage, isFetchingNextPage, fetchNextPage, isFetchNextPageError } = history;
  useEffect(() => {
    if (instrumentNarrowed && hasNextPage && !isFetchingNextPage && !isFetchNextPageError
      && entries.length < MIN_MATCHES) {
      void fetchNextPage();
    }
  }, [instrumentNarrowed, hasNextPage, isFetchingNextPage, isFetchNextPageError,
    entries.length, fetchNextPage]);

  const chips: ActiveFilter[] = [
    ...filters.months.map((m) => ({ key: `months:${m}`, label: monthTitle(m) })),
    ...filters.categories.map((c) => ({
      key: `categories:${c}`, label: CATEGORY_OPTIONS.find((o) => o.key === c)?.label ?? c })),
    ...filters.instruments.map((i) => ({
      key: `instruments:${i}`, label: INSTRUMENT_OPTIONS.find((o) => o.key === i)?.label ?? i })),
    ...filters.statuses.map((s) => ({
      key: `statuses:${s}`, label: STATUS_OPTIONS.find((o) => o.key === s)?.label ?? s })),
  ];

  function setFilters(next: typeof filters) {
    router.setParams({ months: '', categories: '', instruments: '', statuses: '', ...filtersToParams(next) });
  }
  function removeChip(key: string) {
    const [section, ...rest] = key.split(':');
    setFilters(filterReducer(filters,
      { type: 'toggle', section: section as keyof typeof filters, value: rest.join(':') }));
  }

  const header = (
    <View>
      <View style={styles.actions}>
        <PillButton
          testID="open-statements"
          label="My Statements"
          icon="download-outline"
          onPress={() => router.push('/restaurant/wallet/statement')}
        />
        <PillButton
          testID="open-filters"
          label="Filters"
          icon="options-outline"
          trailingIcon="chevron-down"
          onPress={() => router.push({
            pathname: '/restaurant/wallet/filters', params: filtersToParams(filters) })}
        />
      </View>
      <FilterChips filters={chips} onRemove={removeChip} />
    </View>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <MandiHeader title="Wallet Transaction History" subtitle={outlet?.name} back />
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
            <MonthHeader title={section.title} spent={section.spent} />
          )}
          renderItem={({ item }) => (
            <View style={styles.rowPad}><TransactionRow entry={item} /></View>
          )}
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
          contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.screenHorizontal,
    paddingVertical: Spacing.sm,
  },
  pad: { paddingHorizontal: Spacing.screenHorizontal, paddingVertical: Spacing.lg },
  rowPad: { paddingHorizontal: Spacing.screenHorizontal, backgroundColor: Colors.surface },
  footer: { paddingVertical: Spacing.lg, alignItems: 'center' },
});
