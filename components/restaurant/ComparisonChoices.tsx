import React from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiText } from '@/components/common/MandiText';
import { Colors, Radius, Spacing, TouchTarget } from '@/theme';

export type ComparisonSort = 'best_value' | 'price' | 'nearest' | 'rating';

/** What the buyer chose on a product's supplier comparison (API D-149). */
export interface ComparisonChoices {
  sort: ComparisonSort;
  coversQuantity?: boolean;
  openNow?: boolean;
  radiusKm?: number;
}

export const DEFAULT_COMPARISON: ComparisonChoices = { sort: 'best_value' };

const SORTS: { value: ComparisonSort; label: string }[] = [
  { value: 'best_value', label: 'Best value' },
  { value: 'price', label: 'Lowest price' },
  { value: 'nearest', label: 'Nearest' },
  { value: 'rating', label: 'Top rated' },
];

const DISTANCES = [5, 10, 25];

/** The distance chips only earn their place on a long list: everyone on a short one already delivers here. */
export const DISTANCE_CHIPS_FROM = 6;

export function comparisonIsFiltered(choices: ComparisonChoices): boolean {
  return Boolean(choices.coversQuantity) || Boolean(choices.openNow) || choices.radiusKm != null;
}

export function describeComparisonFilters(choices: ComparisonChoices): string[] {
  const list: string[] = [];
  if (choices.coversQuantity) list.push('covers your quantity');
  if (choices.openNow) list.push('open now');
  if (choices.radiusKm != null) list.push(`within ${choices.radiusKm} km`);
  return list;
}

/**
 * How much the buyer needs, how to order the suppliers, and what to leave out.
 *
 * <p>The quantity is on this bar because "covers my quantity" means nothing without one: the comparison used to ask
 * the server about a single unit. Typing 20 asks about 20, so every total and every "only 5 available" is for what
 * the buyer actually wants. The bar changes what is asked of the server and shows what comes back; nothing here sorts
 * or filters the list itself.
 */
export function ComparisonChoicesBar({
  choices,
  onChange,
  need,
  onNeedChange,
  unit,
  supplierCount,
}: {
  choices: ComparisonChoices;
  onChange: (next: ComparisonChoices) => void;
  need: string;
  onNeedChange: (text: string) => void;
  unit: string | null;
  /** Suppliers who could serve this outlet, before the filters. */
  supplierCount: number;
}) {
  const showDistance = supplierCount >= DISTANCE_CHIPS_FROM || choices.radiusKm != null;

  return (
    <View style={styles.container}>
      <View style={styles.needRow}>
        <MandiText variant="captionEmphasis" color={Colors.textSecondary}>I need</MandiText>
        <TextInput
          value={need}
          onChangeText={(text) => onNeedChange(text.replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad"
          accessibilityLabel="Quantity you need"
          style={styles.needInput}
        />
        {unit != null && <MandiText variant="caption" color={Colors.textSecondary}>{unit}</MandiText>}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {SORTS.map((sort) => (
          <Chip
            key={sort.value}
            label={sort.label}
            active={choices.sort === sort.value}
            accessibilityLabel={`Sort by ${sort.label}`}
            onPress={() => onChange({ ...choices, sort: sort.value })}
          />
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Chip
          label="Covers my quantity"
          icon="checkmark-circle-outline"
          active={Boolean(choices.coversQuantity)}
          accessibilityLabel="Covers my quantity filter"
          onPress={() => onChange({ ...choices, coversQuantity: choices.coversQuantity ? undefined : true })}
        />
        <Chip
          label="Open now"
          icon="time-outline"
          active={Boolean(choices.openNow)}
          accessibilityLabel="Open now filter"
          onPress={() => onChange({ ...choices, openNow: choices.openNow ? undefined : true })}
        />
        {showDistance && DISTANCES.map((km) => (
          <Chip
            key={km}
            label={`${km} km`}
            active={choices.radiusKm === km}
            accessibilityLabel={`Distance filter ${km} km`}
            onPress={() => onChange({ ...choices, radiusKm: choices.radiusKm === km ? undefined : km })}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function Chip({
  label, active, onPress, icon, accessibilityLabel,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  accessibilityLabel: string;
}) {
  const color = active ? Colors.textInverse : Colors.textSecondary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && styles.chipActive]}
    >
      {icon != null && <Ionicons name={icon} size={14} color={color} />}
      <MandiText variant="captionEmphasis" color={color}>{label}</MandiText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.xs, paddingVertical: Spacing.xs },
  needRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.screenHorizontal,
  },
  needInput: {
    minWidth: 64,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    color: Colors.textPrimary,
    textAlign: 'center',
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
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
});
