import React from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import type { Category } from '@/models/catalog';
import { MandiText } from '@/components/common';
import { Colors, Radius, Spacing, TouchTarget } from '@/theme';

/**
 * All, then one tab per category.
 *
 * <p>Shared by the supplier's own catalog and the platform catalog they list
 * from, so the two read as the same shelf seen from two sides — which is exactly
 * what they are.
 */
export function CategoryTabs({
  categories,
  selected,
  onSelect,
  counts,
}: {
  categories: Category[];
  /** Null is "All". */
  selected: number | null;
  onSelect: (id: number | null) => void;
  /** Optional per-category counts, keyed by id; `null` keys the All tab. */
  counts?: Map<number | null, number>;
}) {
  function label(name: string, id: number | null) {
    const count = counts?.get(id);
    return count == null ? name : `${name} (${count})`;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.tabs}
    >
      <Tab
        label={label('All', null)}
        active={selected == null}
        onPress={() => onSelect(null)}
      />
      {categories.map((category) => (
        <Tab
          key={category.id}
          label={label(category.name, category.id)}
          active={selected === category.id}
          onPress={() => onSelect(category.id)}
        />
      ))}
    </ScrollView>
  );
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={[styles.tab, active && styles.tabActive]}
    >
      <MandiText
        variant="captionEmphasis"
        color={active ? Colors.textInverse : Colors.textSecondary}
      >
        {label}
      </MandiText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tabs: { gap: Spacing.sm, paddingHorizontal: Spacing.screenHorizontal },
  tab: {
    paddingHorizontal: Spacing.lg,
    justifyContent: 'center',
    minHeight: TouchTarget.min - 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceSunken,
  },
  tabActive: { backgroundColor: Colors.primary },
});
