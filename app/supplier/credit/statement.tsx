import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  RefreshControl, SectionList, StyleSheet, View, type ViewToken,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { fetchAgreement, fetchCreditStatement } from '@/services/credit';
import { CsvExportError, exportStatementCsv } from '@/services/creditExport';
import { useCsvExport } from '@/hooks/useCsvExport';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useDebounced } from '@/hooks/useDebounced';
import { CreditStatementRow } from '@/components/credit/CreditStatementRow';
import { MonthHeader } from '@/components/wallet/MonthHeader';
import { HistorySearch } from '@/components/wallet/HistorySearch';
import { FilterChips, type ActiveFilter } from '@/components/wallet/FilterChips';
import {
  MandiCard,
  MandiEmptyState,
  MandiErrorState,
  MandiHeader,
  MandiHeaderAction,
  MandiOfflineBanner,
  MandiSkeletonList,
  MandiText,
} from '@/components/common';
import {
  groupStatementByMonth,
  rangeText,
  statementErrorMessage,
} from '@/lib/credit/statement';
import {
  EMPTY_STATEMENT_PARAMS,
  NO_STATEMENT_FILTERS,
  PAID_BY_OPTIONS,
  PERIOD_PRESETS,
  RANGE_MESSAGE,
  TYPE_OPTIONS,
  applyLineFilters,
  statementFilterCount,
  statementFiltersFromParams,
  statementFiltersToParams,
  statementRange,
  type StatementFilters,
} from '@/lib/credit/statementFilters';
import { searchLines } from '@/lib/credit/statementSearch';
import { SEARCH_DEBOUNCE_MS, monthTitle } from '@/lib/wallet/history';
import { ApiError } from '@/lib/api/errors';
import { agreementKey, supplierStatementKey } from '@/lib/queryKeys';
import { formatMoney } from '@/utils/money';
import { Colors, Spacing, WalletColors, WalletLayout } from '@/theme';

/** What the balances cover, said once whenever the list is narrower than the period. */
export const BALANCES_NOTE = 'Opening and closing balances cover the whole period';

/**
 * What one restaurant owes this store, in date order (supplier side, plan S7). Every number is the server's: the signed
 * amounts, "Owed after", and the opening and closing balances. This screen only groups
 * the lines by month and words them.
 *
 * <p>Laid out like wallet History: the search field with its filter button and the active
 * filter chips sit directly under the header and are always there. The filters live in the
 * route (the Filters screen sends them back as params). The period goes to the server;
 * Type, Paid by and the search narrow what has loaded, so the balances are labelled as for
 * the whole period when they do. The month bands show no net: that would be adding up lines
 * on the client, and the lines on screen are not all of the period once narrowed.
 */
export default function CreditStatementScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { accessToken } = useSession();
  const { storeId } = useStore();
  const { offline } = useNetworkStatus();
  const params = useLocalSearchParams();
  const rawId = params.agreementId;
  const agreementId = Number(Array.isArray(rawId) ? rawId[0] : rawId);

  const filters = useMemo(
    () => statementFiltersFromParams(params as Record<string, string | undefined>),
    [params],
  );
  const { range, clipped } = useMemo(() => statementRange(filters), [filters]);

  const csv = useCsvExport();
  const [query, setQuery] = useState('');
  const search = useDebounced(query.trim(), SEARCH_DEBOUNCE_MS);
  const searching = search !== '';

  // The server's range and balances, as sent. Under the store's credit key so a write there refreshes it.
  const statement = useQuery({
    queryKey: supplierStatementKey(storeId, agreementId, range?.from ?? null, range?.to ?? null),
    queryFn: () => fetchCreditStatement(accessToken as string, agreementId, range ?? {}),
    enabled: Number.isFinite(agreementId) && storeId != null && accessToken != null,
  });
  const agreement = useQuery({
    queryKey: agreementKey(agreementId),
    queryFn: () => fetchAgreement(accessToken as string, agreementId),
    enabled: Number.isFinite(agreementId) && accessToken != null,
  });
  const restaurant = agreement.data?.restaurantName ?? agreement.data?.outletName ?? undefined;

  const data = statement.data;
  const lineNarrowed = filters.types.length > 0 || filters.paidBy.length > 0;
  const narrowed = lineNarrowed || searching;
  const months = useMemo(
    () => groupStatementByMonth(
      searchLines(applyLineFilters(data?.lines ?? [], filters), search)),
    [data, filters, search],
  );
  const sections = useMemo(
    () => months.map((m) => ({ month: m.month, title: m.title, data: m.lines })),
    [months],
  );

  // The band pinned to the top of the list is the one over the first row on screen.
  const [stuckMonth, setStuckMonth] = useState<string | null>(null);
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems.find((t) => t.item != null);
    const month = (first?.section as { month?: string } | undefined)?.month;
    if (month != null) setStuckMonth(month);
  });

  const chips: ActiveFilter[] = [
    ...(filters.months.length > 0
      ? filters.months.map((m) => ({ key: `months:${m}`, label: monthTitle(m) }))
      : filters.preset !== NO_STATEMENT_FILTERS.preset
        ? [{
          key: 'period:preset',
          label: PERIOD_PRESETS.find((p) => p.key === filters.preset)?.label ?? filters.preset,
        }]
        : []),
    ...filters.types.map((t) => ({
      key: `types:${t}`, label: TYPE_OPTIONS.find((o) => o.key === t)?.label ?? t })),
    ...filters.paidBy.map((p) => ({
      key: `paidBy:${p}`, label: `Paid by ${PAID_BY_OPTIONS.find((o) => o.key === p)?.label ?? p}` })),
  ];

  function setFilters(next: StatementFilters) {
    router.setParams({ ...EMPTY_STATEMENT_PARAMS, ...statementFiltersToParams(next) });
  }
  function removeChip(key: string) {
    const [section = '', ...rest] = key.split(':');
    const value = rest.join(':');
    if (section === 'period') setFilters({ ...filters, preset: NO_STATEMENT_FILTERS.preset });
    else if (section === 'months') {
      setFilters({ ...filters, months: filters.months.filter((m) => m !== value) });
    } else {
      const list = filters[section as 'types' | 'paidBy'] as string[];
      setFilters({ ...filters, [section]: list.filter((v) => v !== value) });
    }
  }
  const clearFilters = () => setFilters(NO_STATEMENT_FILTERS);

  const openFilters = useCallback(() => router.push({
    pathname: '/supplier/credit/statement-filters',
    params: { agreementId: String(agreementId), ...statementFiltersToParams(filters) },
  } as never), [router, agreementId, filters]);

  const filterTotal = statementFilterCount(filters);

  const summary = data == null ? null : (
    <View style={styles.summaryWrap}>
      <MandiText variant="caption" muted testID="statement-range">
        {rangeText(data.from, data.to)}
      </MandiText>
      <MandiCard>
        <View style={styles.summary}>
          <View style={styles.summaryCell}>
            <MandiText variant="caption" muted>They owed at start</MandiText>
            <MandiText variant="price" testID="statement-opening">{formatMoney(data.openingOwed)}</MandiText>
          </View>
          <View style={[styles.summaryCell, styles.summaryEnd]}>
            <MandiText variant="caption" muted>They owe at end</MandiText>
            <MandiText variant="price" testID="statement-closing">{formatMoney(data.closingOwed)}</MandiText>
          </View>
        </View>
        <MandiText variant="caption" muted style={styles.forPeriod}>for this period</MandiText>
      </MandiCard>
      {narrowed && (
        <MandiText variant="caption" muted testID="statement-balances-note">{BALANCES_NOTE}</MandiText>
      )}
      {clipped && (
        <MandiText variant="caption" color={Colors.danger} testID="statement-clipped">
          {RANGE_MESSAGE}
        </MandiText>
      )}
    </View>
  );

  let empty: React.ReactNode;
  if (searching && (data?.lines.length ?? 0) > 0) {
    empty = (
      <MandiEmptyState
        icon="search-outline"
        title="No matches"
        description={`Nothing on this statement matches “${search}”. Try an invoice number, an order number or a reference.`}
        actionLabel="Clear search"
        onAction={() => setQuery('')}
      />
    );
  } else if (lineNarrowed && (data?.lines.length ?? 0) > 0) {
    empty = (
      <MandiEmptyState
        icon="receipt-outline"
        title="Nothing matches these filters"
        description="Try removing a filter to see more."
        actionLabel="Clear filters"
        onAction={clearFilters}
      />
    );
  } else {
    empty = (
      <MandiEmptyState
        icon="receipt-outline"
        title="No credit activity in this period."
        description="Orders on credit and payments will appear here."
        actionLabel={filterTotal > 0 ? 'Clear filters' : undefined}
        onAction={filterTotal > 0 ? clearFilters : undefined}
      />
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <MandiHeader
        title="Statement"
        subtitle={restaurant}
        back
        right={accessToken != null && Number.isFinite(agreementId) ? (
          <MandiHeaderAction
            icon="download-outline"
            label="Export CSV"
            onPress={() => {
              if (offline) { csv.run(() => Promise.reject(new CsvExportError('offline'))); return; }
              void csv.run(() => exportStatementCsv(accessToken, agreementId, range ?? {}));
            }}
          />
        ) : undefined}
      />
      <MandiOfflineBanner visible={offline} />
      {csv.error != null && (
        <View style={styles.exportNote} accessibilityLiveRegion="polite" testID="statement-export-error">
          <MandiText variant="caption" color={Colors.danger}>{csv.error}</MandiText>
        </View>
      )}
      <HistorySearch
        value={query}
        onChangeText={setQuery}
        onOpenFilters={openFilters}
        activeFilters={filterTotal}
        placeholder="Search invoice, order or reference"
        searchLabel="Search this statement"
      />
      <FilterChips
        filters={chips}
        onRemove={removeChip}
        onClearAll={chips.length > 0 ? clearFilters : undefined}
      />

      {statement.isPending ? (
        <View style={styles.pad}><MandiSkeletonList count={5} /></View>
      ) : statement.isError && statement.error instanceof ApiError && statement.error.status === 404 ? (
        <View style={styles.pad}>
          <MandiEmptyState
            icon="lock-closed-outline"
            title="This credit line is not available to you"
            description="It may belong to another store."
            testID="statement-not-found"
          />
        </View>
      ) : statement.isError ? (
        <View style={styles.pad}>
          <MandiErrorState
            message={statementErrorMessage(statement.error)}
            onRetry={() => statement.refetch()}
            retrying={statement.isRefetching}
            testID="statement-error"
          />
        </View>
      ) : (
        <SectionList
          testID="statement-list"
          sections={sections}
          keyExtractor={(line, i) =>
            `${line.at}-${line.type}-${line.walletEntryId ?? line.creditInvoiceId ?? line.supplierOrderId ?? ''}-${i}`}
          stickySectionHeadersEnabled
          ListHeaderComponent={summary}
          renderSectionHeader={({ section }) => (
            <MonthHeader
              title={section.title}
              amount={null}
              stuck={(stuckMonth ?? sections[0]?.month) === section.month}
            />
          )}
          renderItem={({ item, index, section }) => (
            <CreditStatementRow
              line={item}
              last={index === section.data.length - 1}
            />
          )}
          onViewableItemsChanged={onViewable.current}
          viewabilityConfig={VIEWABILITY}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
          refreshControl={(
            <RefreshControl
              refreshing={statement.isRefetching}
              onRefresh={() => { void statement.refetch(); }}
              tintColor={Colors.primary}
            />
          )}
          ListEmptyComponent={<View style={styles.pad}>{empty}</View>}
        />
      )}
    </View>
  );
}

const VIEWABILITY = { itemVisiblePercentThreshold: 1 };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: WalletColors.background },
  pad: { paddingHorizontal: Spacing.screenHorizontal, paddingVertical: Spacing.lg },
  summaryWrap: {
    gap: Spacing.sm,
    paddingHorizontal: Spacing.screenHorizontal,
    paddingTop: WalletLayout.listTop,
    paddingBottom: Spacing.lg,
  },
  summary: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md },
  summaryCell: { flex: 1, gap: 2 },
  summaryEnd: { alignItems: 'flex-end' },
  exportNote: { paddingHorizontal: Spacing.screenHorizontal, paddingVertical: Spacing.xs },
  forPeriod: { marginTop: Spacing.xs },
});
