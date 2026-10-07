import React, { useMemo, useReducer, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { fetchWalletTransactions } from '@/services/wallet';
import { FiltersLayout } from '@/components/filters/FiltersLayout';
import type { FilterChoice } from '@/components/filters/FilterChoiceList';
import {
  BILL_FILTER_OPTIONS,
  CATEGORY_OPTIONS,
  INSTRUMENT_OPTIONS,
  STATUS_OPTIONS,
  canApply,
  filterReducer,
  EMPTY_FILTER_PARAMS,
  filtersFromParams,
  filtersToParams,
  hasInstruments,
  monthChoices,
  type FilterSection,
} from '@/lib/wallet/history';
import { walletTransactionsKey } from '@/lib/queryKeys';

const RAIL: { section: FilterSection; label: string }[] = [
  { section: 'months', label: 'Months' },
  { section: 'categories', label: 'Categories' },
  { section: 'instruments', label: 'Instruments' },
  { section: 'statuses', label: 'Payment status' },
  { section: 'bills', label: 'Bill' },
];

/**
 * REST-WALLET-05. Filters for the wallet history: a rail of what to filter by, and its
 * choices as a checkbox list (the shell is `FiltersLayout`, shared with the credit statement).
 *
 * <p>Starts from the filters the history screen is showing (they arrive as route
 * params) and hands the new set back the same way, so History re-runs its query. The
 * months and the instruments on offer come from the unfiltered first page — the
 * instrument rail is left out when nothing on it says what it was paid with.
 */
export default function WalletFiltersScreen() {
  const router = useRouter();
  const { accessToken } = useSession();
  const { outlet } = useOutlet();
  const params = useLocalSearchParams();

  const applied = useMemo(
    () => filtersFromParams(params as Record<string, string | undefined>),
    [params],
  );
  const [state, dispatch] = useReducer(filterReducer, applied);
  const [section, setSection] = useState<FilterSection>('months');

  const options = useQuery({
    queryKey: walletTransactionsKey(outlet?.id, 'filter-options'),
    queryFn: () => fetchWalletTransactions(accessToken as string, outlet?.id as number, { size: 50 }),
    enabled: outlet != null && accessToken != null,
  });

  const showInstruments = hasInstruments(options.data?.items ?? []) || applied.instruments.length > 0;
  const rail = RAIL.filter((r) => r.section !== 'instruments' || showInstruments);
  const active = rail.some((r) => r.section === section) ? section : 'months';

  const choices: FilterChoice[] = active === 'months'
    ? monthChoices(options.data?.availableMonths ?? [], state.months)
      .map((m) => ({ value: m.month, label: m.label, disabled: m.disabled }))
    : active === 'categories'
      ? CATEGORY_OPTIONS.map((o) => ({ value: o.key, label: o.label }))
      : active === 'instruments'
        ? INSTRUMENT_OPTIONS.map((o) => ({ value: o.key, label: o.label }))
        : active === 'bills'
          ? BILL_FILTER_OPTIONS.map((o) => ({ value: o.key, label: o.label }))
          : STATUS_OPTIONS.map((o) => ({ value: o.key, label: o.label }));

  function apply() {
    router.navigate({
      pathname: '/restaurant/wallet/history',
      params: { ...EMPTY_FILTER_PARAMS, ...filtersToParams(state) },
    });
  }

  return (
    <FiltersLayout
      rail={rail.map((r) => ({
        key: r.section, label: r.label, count: (state[r.section] as string[]).length }))}
      active={active}
      onSelectSection={(key) => setSection(key as FilterSection)}
      items={choices}
      chosen={state[active] as string[]}
      onToggle={(value) => dispatch({ type: 'toggle', section: active, value })}
      onClear={() => dispatch({ type: 'clear' })}
      onApply={apply}
      applyDisabled={!canApply(state, applied)}
    />
  );
}
