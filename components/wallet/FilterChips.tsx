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
  filters, onRemove, onClearAll,
}: {
  filters: ActiveFilter[];
  onRemove: (key: string) => void;
  /** When given, a final "Clear all" chip removes every filter at once. */
  onClearAll?: () => void;
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
          accessibilityActions={[{ name: 'delete', label: `Remove ${filter.label}` }]}
          onAccessibilityAction={() => onRemove(filter.key)}
          // The chip is about 28 dp tall; the slop brings the target to 44.
          hitSlop={{ top: 8, bottom: 8 }}
          style={styles.chip}
        >
          <MandiText variant="captionEmphasis" color={Colors.primary}>{filter.label}</MandiText>
          <Ionicons name="close" size={IconSize.sm} color={Colors.primary} />
        </Pressable>
      ))}
      {onClearAll != null && (
        <Pressable
          testID="clear-all-chips"
          onPress={onClearAll}
          accessibilityRole="button"
          accessibilityLabel="Clear all filters"
          hitSlop={{ top: 8, bottom: 8 }}
          style={styles.clearAll}
        >
          <MandiText variant="captionEmphasis" color={Colors.textSecondary}>Clear all</MandiText>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  clearAll: {
    justifyContent: 'center',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  /** Air above (from the search field) and below; only present when chips are, as the row is not rendered otherwise. */
  scroll: { flexGrow: 0, marginTop: Spacing.md, marginBottom: Spacing.sm },
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
