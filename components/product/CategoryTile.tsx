import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Category } from '@/models/catalog';
import { categoryFace } from '@/models/categories';
import { MandiText } from '@/components/common';
import { Colors, Elevation, Radius, Spacing } from '@/theme';

/** A category in the browse grid. Doc 05 §3 — image-rich, operationally clear. */
export function CategoryTile({
  category,
  onPress,
  variant = 'card',
  selected = false,
}: {
  category: Category;
  onPress: () => void;
  /**
   * `circle` is the Home scroller's form: a bare 44dp disc and label, with a 2dp
   * primary underline on the selected one. `card` is the original grid tile.
   */
  variant?: 'card' | 'circle';
  selected?: boolean;
}) {
  const face = categoryFace(category.name);

  if (variant === 'circle') {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={category.name}
        accessibilityState={{ selected }}
        style={({ pressed }) => [styles.circleTile, pressed && styles.pressed]}
      >
        <View style={[styles.icon, { backgroundColor: face.background }]}>
          <Ionicons name={face.icon} size={22} color={face.tint} />
        </View>
        <MandiText variant="caption" numberOfLines={2} style={styles.label}>
          {category.name}
        </MandiText>
        <View
          testID={selected ? 'category-underline' : undefined}
          style={[styles.underline, selected && styles.underlineOn]}
        />
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={category.name}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
    >
      <View style={[styles.icon, { backgroundColor: face.background }]}>
        <Ionicons name={face.icon} size={22} color={face.tint} />
      </View>
      <MandiText variant="captionEmphasis" numberOfLines={2} style={styles.label}>
        {category.name}
      </MandiText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: '31%',
    minHeight: 104,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    ...Elevation.card,
  },
  pressed: { opacity: 0.7 },
  // No fixed height: the label may take two lines at 1.3x text.
  circleTile: {
    width: 72,
    minHeight: 48,
    alignItems: 'center',
    gap: Spacing.xs,
    paddingTop: Spacing.xs,
  },
  underline: { height: 2, alignSelf: 'stretch', backgroundColor: 'transparent' },
  underlineOn: { backgroundColor: Colors.primary },
  icon: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { textAlign: 'center' },
});
