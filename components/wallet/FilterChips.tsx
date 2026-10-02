import React from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiText } from '@/components/common/MandiText';
import { Colors, IconSize, Radius, Spacing } from '@/theme';

export interface ActiveFilter {
  /** Unique, and what `onRemove` is told. */
  key: string;
  label: string;
}

/** What is narrowing the list, one removable chip each; nothing at all when nothing is. */
export function FilterChips({
  filters, onRemove,
}: {
  filters: ActiveFilter[];
  onRemove: (key: string) => void;
}) {
  if (filters.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.scroll}
      testID="active-filters"
    >
      {filters.map((filter) => (
        <Pressable
          key={filter.key}
          onPress={() => onRemove(filter.key)}
          accessibilityRole="button"
          accessibilityLabel={`Remove filter ${filter.label}`}
          style={styles.chip}
        >
          <MandiText variant="captionEmphasis" color={Colors.primary}>{filter.label}</MandiText>
          <Ionicons name="close" size={IconSize.sm} color={Colors.primary} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  row: { gap: Spacing.sm, paddingHorizontal: Spacing.screenHorizontal },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
});
