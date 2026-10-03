import React, { useMemo, useReducer, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { fetchWalletTransactions } from '@/services/wallet';
import { MandiButton, MandiHeader, MandiStickyBar, MandiText } from '@/components/common';
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
import { Colors, IconSize, Spacing } from '@/theme';

interface Choice { value: string; label: string; disabled?: boolean }

const RAIL: { section: FilterSection; label: string }[] = [
  { section: 'months', label: 'Months' },
  { section: 'categories', label: 'Categories' },
  { section: 'instruments', label: 'Instruments' },
  { section: 'statuses', label: 'Payment status' },
  { section: 'bills', label: 'Bill' },
];

/**
 * REST-WALLET-05. Filters for the wallet history: a rail of what to filter by, and its
 * choices as a checkbox list.
 *
 * <p>Starts from the filters the history screen is showing (they arrive as route
 * params) and hands the new set back the same way, so History re-runs its query. The
 * months and the instruments on offer come from the unfiltered first page — the
 * instrument rail is left out when nothing on it says what it was paid with.
 */
export default function WalletFiltersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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

  const choices: Choice[] = active === 'months'
    ? monthChoices(options.data?.availableMonths ?? [], state.months)
      .map((m) => ({ value: m.month, label: m.label, disabled: m.disabled }))
    : active === 'categories'
      ? CATEGORY_OPTIONS.map((o) => ({ value: o.key, label: o.label }))
      : active === 'instruments'
        ? INSTRUMENT_OPTIONS.map((o) => ({ value: o.key, label: o.label }))
        : active === 'bills'
          ? BILL_FILTER_OPTIONS.map((o) => ({ value: o.key, label: o.label }))
          : STATUS_OPTIONS.map((o) => ({ value: o.key, label: o.label }));

  const chosen = state[active] as string[];

  function apply() {
    router.navigate({
      pathname: '/restaurant/wallet/history',
      params: { ...EMPTY_FILTER_PARAMS, ...filtersToParams(state) },
    });
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <MandiHeader
        title="Filters"
        back
        right={(
          <Pressable
            onPress={() => dispatch({ type: 'clear' })}
            accessibilityRole="button"
            accessibilityLabel="Clear all"
            testID="clear-all"
            style={styles.clear}
          >
            <MandiText variant="bodyEmphasis" color={Colors.primary}>Clear all</MandiText>
          </Pressable>
        )}
      />

      <View style={styles.body}>
        <View style={styles.rail}>
          {rail.map((item) => {
            const count = (state[item.section] as string[]).length;
            const selected = item.section === active;
            return (
              <Pressable
                key={item.section}
                testID={`rail-${item.section}`}
                onPress={() => setSection(item.section)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                style={[styles.railItem, selected && styles.railItemSelected]}
              >
                <MandiText
                  variant="bodyEmphasis"
                  color={selected ? Colors.primary : Colors.textSecondary}
                  style={styles.flex}
                >
                  {item.label}
                </MandiText>
                {count > 0 && (
                  <View style={styles.dot}>
                    <MandiText variant="caption" color={Colors.textInverse}>{String(count)}</MandiText>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        <ScrollView style={styles.flex} contentContainerStyle={styles.list}>
          {choices.map((choice) => {
            const ticked = chosen.includes(choice.value);
            return (
              <Pressable
                key={choice.value}
                testID={`choice-${choice.value}`}
                disabled={choice.disabled}
                onPress={() => dispatch({ type: 'toggle', section: active, value: choice.value })}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: ticked, disabled: choice.disabled === true }}
                style={styles.choice}
              >
                <Ionicons
                  name={ticked ? 'checkbox' : 'square-outline'}
                  size={IconSize.lg}
                  color={choice.disabled ? Colors.textDisabled : ticked ? Colors.primary : Colors.textTertiary}
                />
                <MandiText
                  variant="body"
                  color={choice.disabled ? Colors.textTertiary : Colors.textPrimary}
                  style={styles.flex}
                >
                  {choice.label}
                </MandiText>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <MandiStickyBar>
        <MandiButton
          testID="apply-filters"
          label="Apply"
          disabled={!canApply(state, applied)}
          onPress={apply}
        />
      </MandiStickyBar>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  body: { flex: 1, flexDirection: 'row' },
  flex: { flex: 1 },
  clear: { minHeight: 44, justifyContent: 'center' },
  rail: { width: 132, backgroundColor: Colors.surfaceSunken },
  railItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  railItemSelected: { backgroundColor: Colors.surface, borderLeftColor: Colors.primary },
  dot: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  list: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: 48,
  },
});
