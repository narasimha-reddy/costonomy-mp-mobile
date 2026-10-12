import React from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { MandiText } from './MandiText';
import { Colors, Spacing } from '@/theme';

export interface FilterPillItem {
  key: string;
  label: string;
  count?: number | null;
}

interface Props {
  items: FilterPillItem[];
  selected: string;
  onSelect: (key: string) => void;
}

export const FILTER_PILL_HEIGHT = 34;

/**
 * One horizontally scrolling row of pills: filled dark for the selected one, outlined for the rest.
 * A pill's height is its own, never the row's, so a narrow screen scrolls instead of wrapping into tall boxes.
 */
export function FilterPills({ items, selected, onSelect }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.row}
    >
      {items.map((item) => {
        const active = item.key === selected;
        const hasCount = item.count != null;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={hasCount ? `${item.label}, ${item.count}` : item.label}
            hitSlop={{ top: 7, bottom: 7 }}
            onPress={() => onSelect(item.key)}
            style={[styles.pill, active && styles.pillActive]}
          >
            <MandiText
              variant="captionEmphasis"
              color={active ? Colors.textInverse : Colors.textPrimary}
              numberOfLines={1}
            >
              {hasCount ? `${item.label} ${item.count}` : item.label}
            </MandiText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 0 },
  row: { flexDirection: 'row', gap: Spacing.sm, paddingBottom: Spacing.sm },
  pill: {
    height: FILTER_PILL_HEIGHT,
    paddingHorizontal: 14,
    borderRadius: FILTER_PILL_HEIGHT / 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pillActive: { backgroundColor: Colors.textPrimary, borderColor: Colors.textPrimary },
});
