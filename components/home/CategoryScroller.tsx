import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import type { Category } from '@/models/catalog';
import { CategoryTile } from '@/components/product/CategoryTile';
import { Spacing } from '@/theme';

/**
 * Home's category row: 44dp circles in one horizontal scroll, the selected one
 * carrying a 2dp primary underline. Same categories, same routes as the grid
 * it replaces; it only costs one row of height instead of several.
 */
export function CategoryScroller({
  categories,
  selectedId,
  onSelect,
}: {
  categories: Category[];
  selectedId: number | null;
  onSelect: (category: Category) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.row}
    >
      {categories.map((category) => (
        <CategoryTile
          key={category.id}
          category={category}
          variant="circle"
          selected={category.id === selectedId}
          onPress={() => onSelect(category)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 0 },
  row: { flexDirection: 'row', gap: Spacing.sm },
});
