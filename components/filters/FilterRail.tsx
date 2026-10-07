import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MandiText } from '@/components/common/MandiText';
import { Colors, Spacing } from '@/theme';

export interface FilterRailItem {
  key: string;
  label: string;
  /** How many choices are ticked in this section; a count dot shows when above zero. */
  count: number;
}

/** The left rail of a Filters screen: what to filter by, the selected one highlighted. */
export function FilterRail({
  items, active, onSelect,
}: {
  items: FilterRailItem[];
  active: string;
  onSelect: (key: string) => void;
}) {
  return (
    <View style={styles.rail}>
      {items.map((item) => {
        const selected = item.key === active;
        return (
          <Pressable
            key={item.key}
            testID={`rail-${item.key}`}
            onPress={() => onSelect(item.key)}
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
            {item.count > 0 && (
              <View style={styles.dot}>
                <MandiText variant="caption" color={Colors.textInverse}>{String(item.count)}</MandiText>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
});
