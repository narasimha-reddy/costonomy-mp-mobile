import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiText } from '@/components/common/MandiText';
import { Colors, Radius, Spacing, TouchTarget } from '@/theme';

export type SupplierSort = 'nearest' | 'rating';

export interface SupplierFilters {
  radiusKm?: number;
  openNow?: boolean;
  minRating?: number;
  sort?: SupplierSort;
}

const DISTANCE_CHIPS: { label: string; value?: number }[] = [
  { label: '5 km', value: 5 },
  { label: '10 km', value: 10 },
  { label: '25 km', value: 25 },
];

export function SupplierFilterBar({
  filters,
  onChange,
}: {
  filters: SupplierFilters;
  onChange: (updated: SupplierFilters) => void;
}) {
  const isSortRating = filters.sort === 'rating';

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* Distance chips */}
        {DISTANCE_CHIPS.map((chip) => {
          const selected = filters.radiusKm === chip.value;
          return (
            <Pressable
              key={chip.label}
              onPress={() => {
                onChange({
                  ...filters,
                  radiusKm: selected ? undefined : chip.value,
                });
              }}
              accessibilityRole="button"
              accessibilityLabel={`Distance filter ${chip.label}`}
              accessibilityState={{ selected }}
              style={[styles.chip, selected && styles.chipActive]}
            >
              <MandiText
                variant="captionEmphasis"
                color={selected ? Colors.textInverse : Colors.textSecondary}
              >
                {chip.label}
              </MandiText>
            </Pressable>
          );
        })}

        {/* Open now toggle */}
        <Pressable
          onPress={() => {
            onChange({
              ...filters,
              openNow: filters.openNow ? undefined : true,
            });
          }}
          accessibilityRole="button"
          accessibilityLabel="Open now filter"
          accessibilityState={{ selected: Boolean(filters.openNow) }}
          style={[styles.chip, filters.openNow && styles.chipActive]}
        >
          <Ionicons
            name="time-outline"
            size={14}
            color={filters.openNow ? Colors.textInverse : Colors.textSecondary}
          />
          <MandiText
            variant="captionEmphasis"
            color={filters.openNow ? Colors.textInverse : Colors.textSecondary}
          >
            Open now
          </MandiText>
        </Pressable>

        {/* 4+ stars toggle */}
        <Pressable
          onPress={() => {
            onChange({
              ...filters,
              minRating: filters.minRating === 4 ? undefined : 4,
            });
          }}
          accessibilityRole="button"
          accessibilityLabel="4+ stars filter"
          accessibilityState={{ selected: filters.minRating === 4 }}
          style={[styles.chip, filters.minRating === 4 && styles.chipActive]}
        >
          <Ionicons
            name="star"
            size={12}
            color={filters.minRating === 4 ? Colors.textInverse : Colors.warning}
          />
          <MandiText
            variant="captionEmphasis"
            color={filters.minRating === 4 ? Colors.textInverse : Colors.textSecondary}
          >
            4+ stars
          </MandiText>
        </Pressable>

        {/* Sort control */}
        <Pressable
          onPress={() => {
            onChange({
              ...filters,
              sort: isSortRating ? 'nearest' : 'rating',
            });
          }}
          accessibilityRole="button"
          accessibilityLabel={`Sort by: ${isSortRating ? 'Rating' : 'Nearest'}`}
          accessibilityState={{ selected: isSortRating }}
          style={[styles.chip, isSortRating && styles.chipActive]}
        >
          <Ionicons
            name="swap-vertical-outline"
            size={14}
            color={isSortRating ? Colors.textInverse : Colors.textSecondary}
          />
          <MandiText
            variant="captionEmphasis"
            color={isSortRating ? Colors.textInverse : Colors.textSecondary}
          >
            {isSortRating ? 'Rating' : 'Nearest'}
          </MandiText>
        </Pressable>
      </ScrollView>
      {filters.minRating != null && (
        <MandiText variant="caption" color={Colors.textSecondary} style={styles.hint}>
          Suppliers with no ratings yet are not shown.
        </MandiText>
      )}
    </View>
  );
}

export function activeFilterDescriptions(filters: SupplierFilters): string[] {
  const list: string[] = [];
  if (filters.radiusKm != null) {
    list.push(`within ${filters.radiusKm} km`);
  }
  if (filters.openNow) {
    list.push('open now');
  }
  if (filters.minRating != null) {
    list.push(`${filters.minRating}+ stars`);
  }
  // Sort is how the list is ordered, not something that removes suppliers, so it is not listed as a filter.
  return list;
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: Spacing.xs,
  },
  scroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.screenHorizontal,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    minHeight: TouchTarget.min - 12,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  hint: {
    paddingHorizontal: Spacing.screenHorizontal,
    paddingTop: Spacing.xs,
  },
});
