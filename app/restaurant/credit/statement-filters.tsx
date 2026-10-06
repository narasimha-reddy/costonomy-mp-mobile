import React, { useMemo, useReducer, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FiltersLayout } from '@/components/filters/FiltersLayout';
import type { FilterChoice, FilterHeading } from '@/components/filters/FilterChoiceList';
import {
  EMPTY_STATEMENT_PARAMS,
  PAID_BY_OPTIONS,
  PERIOD_PRESETS,
  RANGE_MESSAGE,
  TYPE_OPTIONS,
  canApplyStatement,
  monthsRange,
  periodCount,
  periodMonthChoices,
  rangeTooWide,
  statementFilterReducer,
  statementFiltersFromParams,
  statementFiltersToParams,
  type StatementFilterSection,
} from '@/lib/credit/statementFilters';

const RAIL: { section: StatementFilterSection; label: string }[] = [
  { section: 'period', label: 'Period' },
  { section: 'types', label: 'Type' },
  { section: 'paidBy', label: 'Paid by' },
];

/**
 * The credit statement's Filters screen: the same shell as the wallet's (`FiltersLayout`),
 * with Period, Type and Paid by. It starts from the filters the statement is showing (route
 * params) and sends the new set back the same way, with the agreement id.
 */
export default function CreditStatementFiltersScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const rawId = params.agreementId;
  const agreementId = Array.isArray(rawId) ? rawId[0] : rawId;

  const applied = useMemo(
    () => statementFiltersFromParams(params as Record<string, string | undefined>),
    [params],
  );
  const [state, dispatch] = useReducer(statementFilterReducer, applied);
  const [section, setSection] = useState<StatementFilterSection>('period');

  const range = monthsRange(state.months);
  const tooWide = range != null && rangeTooWide(range);

  const items: (FilterChoice | FilterHeading)[] = section === 'period'
    ? [
      { heading: 'Quick choices' },
      ...PERIOD_PRESETS.map((p) => ({ value: p.key, label: p.label })),
      { heading: 'Specific months' },
      ...periodMonthChoices(state.months).map((m) => ({ value: m.month, label: m.label })),
    ]
    : section === 'types'
      ? TYPE_OPTIONS.map((o) => ({ value: o.key, label: o.label }))
      : PAID_BY_OPTIONS.map((o) => ({ value: o.key, label: o.label }));

  // One tick for the quick choice in force, or one per month; the default choice shows ticked.
  const chosen: string[] = section === 'period'
    ? (state.months.length > 0 ? state.months : [state.preset])
    : (state[section] as string[]);

  function apply() {
    router.navigate({
      pathname: '/restaurant/credit/statement',
      params: { agreementId, ...EMPTY_STATEMENT_PARAMS, ...statementFiltersToParams(state) },
    });
  }

  return (
    <FiltersLayout
      rail={RAIL.map((r) => ({
        key: r.section,
        label: r.label,
        count: r.section === 'period' ? periodCount(state) : (state[r.section] as string[]).length,
      }))}
      active={section}
      onSelectSection={(key) => setSection(key as StatementFilterSection)}
      items={items}
      chosen={chosen}
      onToggle={(value) => dispatch({ type: 'toggle', section, value })}
      onClear={() => dispatch({ type: 'clear' })}
      onApply={apply}
      applyDisabled={tooWide || !canApplyStatement(state, applied)}
      notice={tooWide ? RANGE_MESSAGE : null}
    />
  );
}
