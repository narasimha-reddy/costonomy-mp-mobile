import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MandiButton, MandiHeader, MandiStickyBar, MandiText } from '@/components/common';
import { FilterRail, type FilterRailItem } from '@/components/filters/FilterRail';
import {
  FilterChoiceList, type FilterChoice, type FilterHeading,
} from '@/components/filters/FilterChoiceList';
import { Colors } from '@/theme';

/**
 * The Filters screen shell shared by the wallet history and the credit statement: a header
 * with "Clear all", a rail of sections, the active section's checkbox list, and a sticky
 * "Apply". It holds no state; the screen owns what is ticked.
 */
export function FiltersLayout({
  rail, active, onSelectSection, items, chosen, onToggle, onClear, onApply, applyDisabled,
  notice,
}: {
  rail: FilterRailItem[];
  active: string;
  onSelectSection: (key: string) => void;
  items: (FilterChoice | FilterHeading)[];
  chosen: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
  onApply: () => void;
  applyDisabled: boolean;
  /** A short message above the Apply button, e.g. why it is off. */
  notice?: string | null;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <MandiHeader
        title="Filters"
        back
        right={(
          <Pressable
            onPress={onClear}
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
        <FilterRail items={rail} active={active} onSelect={onSelectSection} />
        <FilterChoiceList items={items} chosen={chosen} onToggle={onToggle} />
      </View>

      <MandiStickyBar>
        {notice != null && (
          <MandiText variant="caption" color={Colors.danger} testID="filters-notice">{notice}</MandiText>
        )}
        <MandiButton testID="apply-filters" label="Apply" disabled={applyDisabled} onPress={onApply} />
      </MandiStickyBar>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  body: { flex: 1, flexDirection: 'row' },
  clear: { minHeight: 44, justifyContent: 'center' },
});
