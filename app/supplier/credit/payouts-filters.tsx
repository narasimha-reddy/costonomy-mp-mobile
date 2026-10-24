import React, { useMemo, useReducer } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FiltersLayout } from '@/components/filters/FiltersLayout';
import type { FilterChoice, FilterHeading } from '@/components/filters/FilterChoiceList';
import {
  EMPTY_PAYOUT_PARAMS,
  payoutFilterCount,
  payoutFiltersFromParams,
  payoutFiltersToParams,
  payoutReducer,
} from '@/lib/credit/payouts';
import {
  PERIOD_PRESETS, RANGE_MESSAGE, monthsRange, periodMonthChoices, rangeTooWide,
} from '@/lib/credit/statementFilters';

/**
 * The payouts and payments Filters screen: the same shell as the wallet's and the credit
 * statement's, with the Period section only. It starts from the filters the list is showing
 * (route params) and sends the new set back the same way.
 */
export default function PayoutFiltersScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const applied = useMemo(
    () => payoutFiltersFromParams(params as Record<string, string | undefined>),
    [params],
  );
  const [state, dispatch] = useReducer(payoutReducer, applied);

  const range = monthsRange(state.months);
  const tooWide = range != null && rangeTooWide(range);

  const items: (FilterChoice | FilterHeading)[] = [
    { heading: 'Quick choices' },
    ...PERIOD_PRESETS.map((p) => ({ value: p.key, label: p.label })),
    { heading: 'Specific months' },
    ...periodMonthChoices(state.months).map((m) => ({ value: m.month, label: m.label })),
  ];
  const chosen = state.months.length > 0 ? state.months : state.period != null ? [state.period] : [];

  function apply() {
    router.navigate({
      pathname: '/supplier/credit/payouts',
      params: { ...EMPTY_PAYOUT_PARAMS, ...payoutFiltersToParams(state) },
    } as never);
  }

  const changed = JSON.stringify(state) !== JSON.stringify(applied);
  return (
    <FiltersLayout
      rail={[{ key: 'period', label: 'Period', count: payoutFilterCount(state) }]}
      active="period"
      onSelectSection={() => undefined}
      items={items}
      chosen={chosen}
      onToggle={(value) => dispatch({ type: 'toggle', value })}
      onClear={() => dispatch({ type: 'clear' })}
      onApply={apply}
      applyDisabled={tooWide || !(changed || payoutFilterCount(applied) > 0)}
      notice={tooWide ? RANGE_MESSAGE : null}
    />
  );
}
